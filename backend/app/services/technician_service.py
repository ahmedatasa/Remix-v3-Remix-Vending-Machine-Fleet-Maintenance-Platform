import uuid
from typing import List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import selectinload
from backend.app.models.technicians import Technician
from backend.app.models.users import User
from backend.app.models.tickets import Ticket
from backend.app.models.enums import TechnicianStatus, TicketStatus
from backend.app.schemas.technicians import TechnicianCreate, TechnicianUpdate
from backend.app.core.exceptions import NotFoundError, ConflictError
from backend.app.services.audit_service import log_audit_event

async def list_technicians(
    db: AsyncSession,
    status: Optional[TechnicianStatus] = None,
    search: Optional[str] = None
) -> List[Technician]:
    query = select(Technician).options(
        selectinload(Technician.user)
    ).where(Technician.is_deleted == False)

    if status:
        query = query.where(Technician.status == status)

    if search:
        search_filter = or_(
            Technician.employee_code.ilike(f"%{search}%"),
            Technician.specialization.ilike(f"%{search}%")
        )
        query = query.where(search_filter)

    query = query.order_by(Technician.employee_code.asc())
    return list((await db.execute(query)).scalars().all())

async def get_technician_by_id(db: AsyncSession, technician_id: str) -> Technician:
    uid = uuid.UUID(technician_id)
    stmt = select(Technician).options(
        selectinload(Technician.user)
    ).where(Technician.id == uid, Technician.is_deleted == False)
    tech = (await db.execute(stmt)).scalar_one_or_none()
    if not tech:
        raise NotFoundError("Technician", technician_id)
    return tech

async def create_technician(db: AsyncSession, data: TechnicianCreate, creator_id: Optional[str] = None) -> Technician:
    # Check if user exists
    user_uid = uuid.UUID(data.user_id)
    user_stmt = select(User).where(User.id == user_uid, User.is_deleted == False)
    if not (await db.execute(user_stmt)).scalar_one_or_none():
        raise NotFoundError("User", data.user_id)

    # Check duplicate employee_code
    code_stmt = select(Technician).where(Technician.employee_code == data.employee_code)
    if (await db.execute(code_stmt)).scalar_one_or_none():
        raise ConflictError(f"Employee code '{data.employee_code}' is already assigned")

    tech = Technician(
        user_id=user_uid,
        employee_code=data.employee_code,
        specialization=data.specialization,
        status=data.status,
        skills=data.skills,
        assigned_region=data.assigned_region,
        max_active_tickets=data.max_active_tickets
    )
    db.add(tech)
    await db.flush()
    await log_audit_event(db, "TECHNICIAN_CREATE", "technicians", str(tech.id), creator_id, new_values={"code": tech.employee_code})
    await db.commit()
    return await get_technician_by_id(db, str(tech.id))

async def update_technician(db: AsyncSession, technician_id: str, data: TechnicianUpdate, user_id: Optional[str] = None) -> Technician:
    tech = await get_technician_by_id(db, technician_id)
    if data.specialization is not None:
        tech.specialization = data.specialization
    if data.status is not None:
        tech.status = data.status
    if data.skills is not None:
        tech.skills = data.skills
    if data.assigned_region is not None:
        tech.assigned_region = data.assigned_region
    if data.max_active_tickets is not None:
        tech.max_active_tickets = data.max_active_tickets

    db.add(tech)
    await log_audit_event(db, "TECHNICIAN_UPDATE", "technicians", str(tech.id), user_id)
    await db.commit()
    return await get_technician_by_id(db, str(tech.id))

async def get_technician_active_workload(db: AsyncSession, technician_id: str) -> int:
    uid = uuid.UUID(technician_id)
    stmt = select(func.count(Ticket.id)).where(
        Ticket.assigned_technician_id == uid,
        Ticket.status.in_([TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS]),
        Ticket.is_deleted == False
    )
    return (await db.execute(stmt)).scalar() or 0
