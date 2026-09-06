import uuid
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Tuple, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import selectinload
from backend.app.models.tickets import Ticket, TicketStatusHistory, MaintenanceAction
from backend.app.models.machines import Machine
from backend.app.models.buildings import MachineLocation, Location
from backend.app.models.technicians import Technician
from backend.app.models.users import User
from backend.app.models.enums import TicketStatus, TicketPriority, TicketSource, FaultCategory, MachineStatus
from backend.app.schemas.tickets import TicketCreate, TicketPublicCreate, TicketUpdate, TicketStatusUpdate, MaintenanceActionCreate
from backend.app.core.exceptions import NotFoundError, BusinessLogicError
from backend.app.services.audit_service import log_audit_event
from backend.app.services.notification_service import create_notification

def _calculate_sla(priority: TicketPriority) -> datetime:
    now = datetime.now(timezone.utc)
    if priority == TicketPriority.CRITICAL:
        return now + timedelta(hours=2)
    elif priority == TicketPriority.HIGH:
        return now + timedelta(hours=4)
    elif priority == TicketPriority.MEDIUM:
        return now + timedelta(hours=12)
    else:
        return now + timedelta(hours=24)

async def _generate_ticket_number(db: AsyncSession) -> str:
    today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    random_suffix = secrets.token_hex(2).upper()
    return f"TCK-{today_str}-{random_suffix}"

async def list_tickets(
    db: AsyncSession,
    offset: int = 0,
    limit: int = 20,
    status: Optional[TicketStatus] = None,
    priority: Optional[TicketPriority] = None,
    category: Optional[FaultCategory] = None,
    technician_id: Optional[str] = None,
    machine_id: Optional[str] = None,
    search: Optional[str] = None
) -> Tuple[List[Ticket], int]:
    query = select(Ticket).options(
        selectinload(Ticket.machine),
        selectinload(Ticket.location).selectinload(Location.building),
        selectinload(Ticket.location).selectinload(Location.floor),
        selectinload(Ticket.assigned_technician).selectinload(Technician.user)
    ).where(Ticket.is_deleted == False)

    count_query = select(func.count(Ticket.id)).where(Ticket.is_deleted == False)

    if status:
        query = query.where(Ticket.status == status)
        count_query = count_query.where(Ticket.status == status)
    if priority:
        query = query.where(Ticket.priority == priority)
        count_query = count_query.where(Ticket.priority == priority)
    if category:
        query = query.where(Ticket.category == category)
        count_query = count_query.where(Ticket.category == category)
    if technician_id:
        t_uid = uuid.UUID(technician_id)
        query = query.where(Ticket.assigned_technician_id == t_uid)
        count_query = count_query.where(Ticket.assigned_technician_id == t_uid)
    if machine_id:
        m_uid = uuid.UUID(machine_id)
        query = query.where(Ticket.machine_id == m_uid)
        count_query = count_query.where(Ticket.machine_id == m_uid)
    if search:
        search_filter = or_(
            Ticket.ticket_number.ilike(f"%{search}%"),
            Ticket.description.ilike(f"%{search}%"),
            Ticket.reporter_name.ilike(f"%{search}%")
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    query = query.order_by(Ticket.created_at.desc()).offset(offset).limit(limit)

    total = (await db.execute(count_query)).scalar() or 0
    items = (await db.execute(query)).scalars().all()
    return list(items), total

async def get_ticket_by_id(db: AsyncSession, ticket_id: str) -> Ticket:
    uid = uuid.UUID(ticket_id)
    stmt = select(Ticket).options(
        selectinload(Ticket.machine),
        selectinload(Ticket.location).selectinload(Location.building),
        selectinload(Ticket.location).selectinload(Location.floor),
        selectinload(Ticket.assigned_technician).selectinload(Technician.user),
        selectinload(Ticket.status_history).selectinload(TicketStatusHistory.changed_by_user),
        selectinload(Ticket.maintenance_actions).selectinload(MaintenanceAction.technician).selectinload(Technician.user)
    ).where(Ticket.id == uid, Ticket.is_deleted == False)
    t = (await db.execute(stmt)).scalar_one_or_none()
    if not t:
        raise NotFoundError("Ticket", ticket_id)
    return t

async def create_ticket(db: AsyncSession, data: TicketCreate, user_id: Optional[str] = None) -> Ticket:
    m_uid = uuid.UUID(data.machine_id)
    machine = (await db.execute(select(Machine).where(Machine.id == m_uid, Machine.is_deleted == False))).scalar_one_or_none()
    if not machine:
        raise NotFoundError("Machine", data.machine_id)

    # Determine location
    loc_id: Optional[uuid.UUID] = None
    if data.location_id:
        loc_id = uuid.UUID(data.location_id)
    else:
        curr_loc_stmt = select(MachineLocation).where(MachineLocation.machine_id == m_uid, MachineLocation.is_current == True)
        curr_loc = (await db.execute(curr_loc_stmt)).scalar_one_or_none()
        if curr_loc:
            loc_id = curr_loc.location_id

    if not loc_id:
        # Fallback to any active location
        any_loc = (await db.execute(select(Location).where(Location.is_deleted == False).limit(1))).scalar_one_or_none()
        if not any_loc:
            raise BusinessLogicError("No locations available to assign to ticket")
        loc_id = any_loc.id

    # Check recurring failures within 30 days
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    rec_stmt = select(func.count(Ticket.id)).where(
        Ticket.machine_id == m_uid,
        Ticket.created_at >= thirty_days_ago
    )
    prev_failures = (await db.execute(rec_stmt)).scalar() or 0
    is_recurring = prev_failures >= 2

    ticket_number = await _generate_ticket_number(db)
    sla_due = _calculate_sla(data.priority)

    initial_status = TicketStatus.ASSIGNED if data.assigned_technician_id else TicketStatus.OPEN

    ticket = Ticket(
        ticket_number=ticket_number,
        machine_id=m_uid,
        location_id=loc_id,
        source=data.source,
        category=data.category,
        priority=data.priority,
        status=initial_status,
        description=data.description,
        reporter_name=data.reporter_name,
        reporter_phone=data.reporter_phone,
        assigned_technician_id=uuid.UUID(data.assigned_technician_id) if data.assigned_technician_id else None,
        is_recurring=is_recurring,
        recurring_occurrence_count=prev_failures + 1,
        sla_due_at=sla_due
    )
    db.add(ticket)
    await db.flush()

    # Record initial history
    history = TicketStatusHistory(
        ticket_id=ticket.id,
        previous_status=None,
        new_status=initial_status,
        changed_by=uuid.UUID(user_id) if user_id else None,
        comment="Ticket created"
    )
    db.add(history)

    # Machine status degradation
    if data.priority in [TicketPriority.CRITICAL, TicketPriority.HIGH]:
        machine.status = MachineStatus.OFFLINE
    else:
        machine.status = MachineStatus.DEGRADED
    machine.health_score = max(10, machine.health_score - 20)
    db.add(machine)

    await log_audit_event(db, "TICKET_CREATE", "tickets", str(ticket.id), user_id, new_values={"ticket_number": ticket_number})
    await db.commit()
    return await get_ticket_by_id(db, str(ticket.id))

async def create_public_qr_report(db: AsyncSession, data: TicketPublicCreate) -> Ticket:
    """Public customer-facing QR code issue reporter."""
    m_stmt = select(Machine).where(Machine.public_id == data.machine_public_id, Machine.is_deleted == False)
    machine = (await db.execute(m_stmt)).scalar_one_or_none()
    if not machine:
        raise NotFoundError("Machine with Public ID", data.machine_public_id)

    ticket_in = TicketCreate(
        machine_id=str(machine.id),
        source=TicketSource.QR_CODE_SCAN,
        category=data.category,
        priority=TicketPriority.HIGH if data.category in [FaultCategory.BILL_ACCEPTOR, FaultCategory.COOLING_SYSTEM] else TicketPriority.MEDIUM,
        description=data.description,
        reporter_name=data.reporter_name or "Anonymous Customer",
        reporter_phone=data.reporter_phone
    )
    return await create_ticket(db, ticket_in)

async def assign_ticket(db: AsyncSession, ticket_id: str, technician_id: str, comment: Optional[str] = None, user_id: Optional[str] = None) -> Ticket:
    ticket = await get_ticket_by_id(db, ticket_id)
    tech = (await db.execute(select(Technician).options(selectinload(Technician.user)).where(Technician.id == uuid.UUID(technician_id)))).scalar_one_or_none()
    if not tech:
        raise NotFoundError("Technician", technician_id)

    prev_status = ticket.status
    ticket.assigned_technician_id = tech.id
    if ticket.status == TicketStatus.OPEN:
        ticket.status = TicketStatus.ASSIGNED

    db.add(ticket)

    # History
    history = TicketStatusHistory(
        ticket_id=ticket.id,
        previous_status=prev_status,
        new_status=ticket.status,
        changed_by=uuid.UUID(user_id) if user_id else None,
        comment=comment or f"Assigned to technician {tech.employee_code}"
    )
    db.add(history)

    # In-app notification to technician user
    if tech.user_id:
        await create_notification(
            db=db,
            user_id=str(tech.user_id),
            title="New Ticket Assigned",
            message=f"Ticket {ticket.ticket_number} has been assigned to you. Priority: {ticket.priority.value}",
            notification_type="TICKET_ASSIGNED",
            reference_id=str(ticket.id)
        )

    await log_audit_event(db, "TICKET_ASSIGN", "tickets", str(ticket.id), user_id, new_values={"technician_id": technician_id})
    await db.commit()
    return await get_ticket_by_id(db, str(ticket.id))

async def update_ticket_status(db: AsyncSession, ticket_id: str, status_data: TicketStatusUpdate, user_id: Optional[str] = None) -> Ticket:
    ticket = await get_ticket_by_id(db, ticket_id)
    prev_status = ticket.status
    now = datetime.now(timezone.utc)

    ticket.status = status_data.new_status

    if status_data.new_status == TicketStatus.IN_PROGRESS and not ticket.started_at:
        ticket.started_at = now
    elif status_data.new_status == TicketStatus.RESOLVED:
        ticket.resolved_at = now
        if status_data.root_cause:
            ticket.root_cause = status_data.root_cause
        if status_data.resolution_summary:
            ticket.resolution_summary = status_data.resolution_summary
    elif status_data.new_status == TicketStatus.CLOSED:
        ticket.closed_at = now
        # Restore machine status
        machine = (await db.execute(select(Machine).where(Machine.id == ticket.machine_id))).scalar_one_or_none()
        if machine:
            machine.status = MachineStatus.OPERATIONAL
            machine.health_score = min(100, machine.health_score + 15)
            machine.last_maintenance_at = now
            db.add(machine)

    db.add(ticket)

    history = TicketStatusHistory(
        ticket_id=ticket.id,
        previous_status=prev_status,
        new_status=status_data.new_status,
        changed_by=uuid.UUID(user_id) if user_id else None,
        comment=status_data.comment or f"Status changed from {prev_status.value} to {status_data.new_status.value}"
    )
    db.add(history)

    await log_audit_event(db, "TICKET_STATUS_CHANGE", "tickets", str(ticket.id), user_id, new_values={"status": status_data.new_status.value})
    await db.commit()
    return await get_ticket_by_id(db, str(ticket.id))

async def add_maintenance_action(db: AsyncSession, ticket_id: str, action_data: MaintenanceActionCreate, user_id: Optional[str] = None) -> MaintenanceAction:
    ticket = await get_ticket_by_id(db, ticket_id)
    
    # Resolve technician
    tech_id: Optional[uuid.UUID] = None
    if action_data.technician_id:
        tech_id = uuid.UUID(action_data.technician_id)
    elif ticket.assigned_technician_id:
        tech_id = ticket.assigned_technician_id
    else:
        first_tech = (await db.execute(select(Technician).limit(1))).scalar_one_or_none()
        if not first_tech:
            raise BusinessLogicError("No technician assigned to this action")
        tech_id = first_tech.id

    action = MaintenanceAction(
        ticket_id=ticket.id,
        technician_id=tech_id,
        action_type=action_data.action_type,
        description=action_data.description,
        parts_replaced=action_data.parts_replaced,
        duration_minutes=action_data.duration_minutes
    )
    db.add(action)
    await db.flush()

    await log_audit_event(db, "MAINTENANCE_ACTION_ADD", "maintenance_actions", str(action.id), user_id)
    await db.commit()
    
    stmt = select(MaintenanceAction).options(
        selectinload(MaintenanceAction.technician).selectinload(Technician.user)
    ).where(MaintenanceAction.id == action.id)
    return (await db.execute(stmt)).scalar_one()
