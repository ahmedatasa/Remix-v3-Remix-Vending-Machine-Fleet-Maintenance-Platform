import uuid
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from backend.app.models.suppliers import Supplier
from backend.app.schemas.inventory import SupplierCreate, SupplierUpdate
from backend.app.core.exceptions import NotFoundError
from backend.app.services.audit_service import log_audit_event

async def list_suppliers(db: AsyncSession, search: Optional[str] = None) -> List[Supplier]:
    stmt = select(Supplier).where(Supplier.is_deleted == False)
    if search:
        search_filter = or_(
            Supplier.name.ilike(f"%{search}%"),
            Supplier.contact_person.ilike(f"%{search}%"),
            Supplier.email.ilike(f"%{search}%")
        )
        stmt = stmt.where(search_filter)
    stmt = stmt.order_by(Supplier.name.asc())
    return list((await db.execute(stmt)).scalars().all())

async def get_supplier_by_id(db: AsyncSession, supplier_id: str) -> Supplier:
    uid = uuid.UUID(supplier_id)
    stmt = select(Supplier).where(Supplier.id == uid, Supplier.is_deleted == False)
    s = (await db.execute(stmt)).scalar_one_or_none()
    if not s:
        raise NotFoundError("Supplier", supplier_id)
    return s

async def create_supplier(db: AsyncSession, data: SupplierCreate, user_id: Optional[str] = None) -> Supplier:
    s = Supplier(
        name=data.name,
        contact_person=data.contact_person,
        email=data.email,
        phone=data.phone,
        address=data.address,
        lead_time_days=data.lead_time_days,
        rating=data.rating
    )
    db.add(s)
    await db.flush()
    await log_audit_event(db, "SUPPLIER_CREATE", "suppliers", str(s.id), user_id, new_values={"name": s.name})
    await db.commit()
    return s

async def update_supplier(db: AsyncSession, supplier_id: str, data: SupplierUpdate, user_id: Optional[str] = None) -> Supplier:
    s = await get_supplier_by_id(db, supplier_id)
    if data.name is not None:
        s.name = data.name
    if data.contact_person is not None:
        s.contact_person = data.contact_person
    if data.email is not None:
        s.email = data.email
    if data.phone is not None:
        s.phone = data.phone
    if data.address is not None:
        s.address = data.address
    if data.lead_time_days is not None:
        s.lead_time_days = data.lead_time_days
    if data.rating is not None:
        s.rating = data.rating

    db.add(s)
    await log_audit_event(db, "SUPPLIER_UPDATE", "suppliers", str(s.id), user_id)
    await db.commit()
    return s
