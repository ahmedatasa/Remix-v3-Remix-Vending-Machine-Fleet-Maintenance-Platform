import uuid
from datetime import datetime, timezone
from typing import List, Optional, Tuple, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import selectinload
from backend.app.models.inventory import SparePart, SparePartCategory, InventoryTransaction, SparePartRequest
from backend.app.models.suppliers import Supplier
from backend.app.models.tickets import Ticket
from backend.app.models.technicians import Technician
from backend.app.models.users import User
from backend.app.models.enums import InventoryTransactionType, PartRequestStatus
from backend.app.schemas.inventory import (
    SparePartCreate, SparePartUpdate, SparePartCategoryCreate,
    InventoryTransactionCreate, SparePartRequestCreate, SparePartRequestStatusUpdate
)
from backend.app.core.exceptions import NotFoundError, ConflictError, BusinessLogicError
from backend.app.services.audit_service import log_audit_event
from backend.app.services.notification_service import create_notification

# --- Categories ---
async def list_categories(db: AsyncSession) -> List[SparePartCategory]:
    stmt = select(SparePartCategory).order_by(SparePartCategory.name.asc())
    return list((await db.execute(stmt)).scalars().all())

async def create_category(db: AsyncSession, data: SparePartCategoryCreate, user_id: Optional[str] = None) -> SparePartCategory:
    cat = SparePartCategory(name=data.name, code=data.code, description=data.description)
    db.add(cat)
    await db.flush()
    await log_audit_event(db, "CATEGORY_CREATE", "spare_part_categories", str(cat.id), user_id)
    await db.commit()
    return cat

# --- Spare Parts ---
async def list_spare_parts(
    db: AsyncSession,
    offset: int = 0,
    limit: int = 50,
    category_id: Optional[str] = None,
    low_stock_only: bool = False,
    search: Optional[str] = None
) -> Tuple[List[SparePart], int]:
    query = select(SparePart).options(
        selectinload(SparePart.category),
        selectinload(SparePart.primary_supplier)
    ).where(SparePart.is_deleted == False)

    count_query = select(func.count(SparePart.id)).where(SparePart.is_deleted == False)

    if category_id:
        c_uid = uuid.UUID(category_id)
        query = query.where(SparePart.category_id == c_uid)
        count_query = count_query.where(SparePart.category_id == c_uid)

    if low_stock_only:
        query = query.where(SparePart.quantity_on_hand <= SparePart.minimum_threshold)
        count_query = count_query.where(SparePart.quantity_on_hand <= SparePart.minimum_threshold)

    if search:
        search_filter = or_(
            SparePart.part_number.ilike(f"%{search}%"),
            SparePart.name.ilike(f"%{search}%")
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    query = query.order_by(SparePart.name.asc()).offset(offset).limit(limit)

    total = (await db.execute(count_query)).scalar() or 0
    items = (await db.execute(query)).scalars().all()
    return list(items), total

async def get_spare_part_by_id(db: AsyncSession, part_id: str) -> SparePart:
    uid = uuid.UUID(part_id)
    stmt = select(SparePart).options(
        selectinload(SparePart.category),
        selectinload(SparePart.primary_supplier)
    ).where(SparePart.id == uid, SparePart.is_deleted == False)
    p = (await db.execute(stmt)).scalar_one_or_none()
    if not p:
        raise NotFoundError("Spare Part", part_id)
    return p

async def create_spare_part(db: AsyncSession, data: SparePartCreate, user_id: Optional[str] = None) -> SparePart:
    # Check duplicate part_number
    exist = (await db.execute(select(SparePart).where(SparePart.part_number == data.part_number, SparePart.is_deleted == False))).scalar_one_or_none()
    if exist:
        raise ConflictError(f"Part number '{data.part_number}' already exists")

    part = SparePart(
        part_number=data.part_number,
        name=data.name,
        category_id=uuid.UUID(data.category_id) if data.category_id else None,
        compatible_models=data.compatible_models,
        unit_cost=data.unit_cost,
        quantity_on_hand=data.quantity_on_hand,
        minimum_threshold=data.minimum_threshold,
        reorder_quantity=data.reorder_quantity,
        primary_supplier_id=uuid.UUID(data.primary_supplier_id) if data.primary_supplier_id else None,
        storage_location=data.storage_location
    )
    db.add(part)
    await db.flush()
    await log_audit_event(db, "SPARE_PART_CREATE", "spare_parts", str(part.id), user_id, new_values={"part_number": part.part_number})
    await db.commit()
    return await get_spare_part_by_id(db, str(part.id))

async def update_spare_part(db: AsyncSession, part_id: str, data: SparePartUpdate, user_id: Optional[str] = None) -> SparePart:
    part = await get_spare_part_by_id(db, part_id)
    if data.name is not None:
        part.name = data.name
    if data.unit_cost is not None:
        part.unit_cost = data.unit_cost
    if data.quantity_on_hand is not None:
        part.quantity_on_hand = data.quantity_on_hand
    if data.minimum_threshold is not None:
        part.minimum_threshold = data.minimum_threshold
    if data.reorder_quantity is not None:
        part.reorder_quantity = data.reorder_quantity
    if data.storage_location is not None:
        part.storage_location = data.storage_location

    db.add(part)
    await log_audit_event(db, "SPARE_PART_UPDATE", "spare_parts", str(part.id), user_id)
    await db.commit()
    return await get_spare_part_by_id(db, str(part.id))

# --- Inventory Transactions ---
async def create_inventory_transaction(
    db: AsyncSession,
    data: InventoryTransactionCreate,
    user_id: Optional[str] = None
) -> InventoryTransaction:
    part = await get_spare_part_by_id(db, data.part_id)
    
    # Calculate new balance
    new_balance = part.quantity_on_hand + data.quantity
    if new_balance < 0:
        raise BusinessLogicError(f"Insufficient stock for part '{part.name}'. Available: {part.quantity_on_hand}, Requested: {abs(data.quantity)}")

    part.quantity_on_hand = new_balance
    db.add(part)

    tx = InventoryTransaction(
        part_id=part.id,
        transaction_type=data.transaction_type,
        quantity=data.quantity,
        balance_after=new_balance,
        unit_cost=data.unit_cost or part.unit_cost,
        ticket_id=uuid.UUID(data.ticket_id) if data.ticket_id else None,
        machine_id=uuid.UUID(data.machine_id) if data.machine_id else None,
        reference_number=data.reference_number,
        performed_by=uuid.UUID(user_id) if user_id else None,
        notes=data.notes
    )
    db.add(tx)
    await db.flush()

    # Trigger alert if stock dropped below threshold
    if new_balance <= part.minimum_threshold:
        # Find warehouse managers/admins
        admin_stmt = select(User).where(User.role.in_(["SUPER_ADMIN", "WAREHOUSE_MANAGER"]), User.is_deleted == False)
        admins = (await db.execute(admin_stmt)).scalars().all()
        for admin in admins:
            await create_notification(
                db=db,
                user_id=str(admin.id),
                title="Low Stock Alert",
                message=f"Part {part.part_number} ({part.name}) is low on stock ({new_balance} remaining).",
                notification_type="LOW_STOCK_ALERT",
                reference_id=str(part.id)
            )

    await log_audit_event(
        db, "INVENTORY_TRANSACTION", "inventory_transactions", str(tx.id), user_id,
        new_values={"part_id": str(part.id), "qty": data.quantity, "new_balance": new_balance}
    )
    await db.commit()

    stmt = select(InventoryTransaction).options(
        selectinload(InventoryTransaction.part),
        selectinload(InventoryTransaction.user)
    ).where(InventoryTransaction.id == tx.id)
    return (await db.execute(stmt)).scalar_one()

# --- Spare Part Requests ---
async def list_part_requests(
    db: AsyncSession,
    ticket_id: Optional[str] = None,
    status: Optional[PartRequestStatus] = None
) -> List[SparePartRequest]:
    stmt = select(SparePartRequest).options(
        selectinload(SparePartRequest.part),
        selectinload(SparePartRequest.technician).selectinload(Technician.user),
        selectinload(SparePartRequest.approver)
    ).where(SparePartRequest.is_deleted == False)

    if ticket_id:
        stmt = stmt.where(SparePartRequest.ticket_id == uuid.UUID(ticket_id))
    if status:
        stmt = stmt.where(SparePartRequest.status == status)

    stmt = stmt.order_by(SparePartRequest.created_at.desc())
    return list((await db.execute(stmt)).scalars().all())

async def create_part_request(
    db: AsyncSession,
    data: SparePartRequestCreate,
    technician_user_id: str
) -> SparePartRequest:
    ticket = (await db.execute(select(Ticket).where(Ticket.id == uuid.UUID(data.ticket_id)))).scalar_one_or_none()
    if not ticket:
        raise NotFoundError("Ticket", data.ticket_id)

    tech = (await db.execute(select(Technician).where(Technician.user_id == uuid.UUID(technician_user_id)))).scalar_one_or_none()
    if not tech:
        # Fallback to any technician
        tech = (await db.execute(select(Technician).limit(1))).scalar_one_or_none()
        if not tech:
            raise BusinessLogicError("User does not have an associated technician profile")

    part = await get_spare_part_by_id(db, data.part_id)

    req = SparePartRequest(
        ticket_id=ticket.id,
        part_id=part.id,
        technician_id=tech.id,
        quantity_requested=data.quantity_requested,
        quantity_approved=0,
        status=PartRequestStatus.PENDING,
        notes=data.notes
    )
    db.add(req)
    await db.flush()

    await log_audit_event(db, "PART_REQUEST_CREATE", "spare_part_requests", str(req.id), technician_user_id)
    await db.commit()

    stmt = select(SparePartRequest).options(
        selectinload(SparePartRequest.part),
        selectinload(SparePartRequest.technician).selectinload(Technician.user)
    ).where(SparePartRequest.id == req.id)
    return (await db.execute(stmt)).scalar_one()

async def update_part_request_status(
    db: AsyncSession,
    request_id: str,
    status_data: SparePartRequestStatusUpdate,
    user_id: str
) -> SparePartRequest:
    stmt = select(SparePartRequest).options(
        selectinload(SparePartRequest.part),
        selectinload(SparePartRequest.technician)
    ).where(SparePartRequest.id == uuid.UUID(request_id))
    req = (await db.execute(stmt)).scalar_one_or_none()
    if not req:
        raise NotFoundError("Part Request", request_id)

    req.status = status_data.status
    if status_data.status == PartRequestStatus.APPROVED:
        req.quantity_approved = req.quantity_requested
        req.approved_by = uuid.UUID(user_id)
    elif status_data.status == PartRequestStatus.ISSUED:
        # Deduct stock
        tx_data = InventoryTransactionCreate(
            part_id=str(req.part_id),
            transaction_type=InventoryTransactionType.OUTBOUND_MAINTENANCE,
            quantity=-req.quantity_approved,
            ticket_id=str(req.ticket_id),
            notes=f"Issued for Part Request #{req.id}"
        )
        await create_inventory_transaction(db, tx_data, user_id)

    db.add(req)
    await log_audit_event(db, "PART_REQUEST_STATUS", "spare_part_requests", str(req.id), user_id, new_values={"status": status_data.status.value})
    await db.commit()
    return req
