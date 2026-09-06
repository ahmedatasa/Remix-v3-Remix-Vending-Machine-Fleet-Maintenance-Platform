import uuid
import secrets
from datetime import datetime, timezone
from typing import List, Optional, Tuple, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, update
from sqlalchemy.orm import selectinload
from backend.app.models.machines import Machine, MachineModel
from backend.app.models.buildings import MachineLocation, Location
from backend.app.models.qr_codes import QRCode
from backend.app.models.enums import MachineStatus, DataQualityStatus
from backend.app.schemas.machines import MachineCreate, MachineUpdate, MachineModelCreate
from backend.app.core.exceptions import NotFoundError, ConflictError, BusinessLogicError
from backend.app.services.audit_service import log_audit_event

# --- Machine Models ---
async def list_machine_models(db: AsyncSession) -> List[MachineModel]:
    stmt = select(MachineModel).where(MachineModel.is_deleted == False).order_by(MachineModel.model_name.asc())
    return list((await db.execute(stmt)).scalars().all())

async def create_machine_model(db: AsyncSession, data: MachineModelCreate, user_id: Optional[str] = None) -> MachineModel:
    model = MachineModel(
        model_name=data.model_name,
        manufacturer=data.manufacturer,
        category=data.category,
        specifications=data.specifications
    )
    db.add(model)
    await db.flush()
    await log_audit_event(db, "MACHINE_MODEL_CREATE", "machine_models", str(model.id), user_id)
    await db.commit()
    return model

# --- Machines ---
async def list_machines(
    db: AsyncSession,
    offset: int = 0,
    limit: int = 20,
    status: Optional[MachineStatus] = None,
    building_id: Optional[str] = None,
    search: Optional[str] = None,
    quality_status: Optional[DataQualityStatus] = None
) -> Tuple[List[Machine], int]:
    query = select(Machine).options(
        selectinload(Machine.model),
        selectinload(Machine.qr_code),
        selectinload(Machine.location_associations).selectinload(MachineLocation.location).selectinload(Location.building),
        selectinload(Machine.location_associations).selectinload(MachineLocation.location).selectinload(Location.floor)
    ).where(Machine.is_deleted == False)

    count_query = select(func.count(Machine.id)).where(Machine.is_deleted == False)

    if status:
        query = query.where(Machine.status == status)
        count_query = count_query.where(Machine.status == status)

    if quality_status:
        query = query.where(Machine.data_quality_status == quality_status)
        count_query = count_query.where(Machine.data_quality_status == quality_status)

    if search:
        search_filter = or_(
            Machine.machine_number.ilike(f"%{search}%"),
            Machine.serial_number.ilike(f"%{search}%"),
            Machine.public_id.ilike(f"%{search}%")
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    query = query.order_by(Machine.created_at.desc()).offset(offset).limit(limit)

    total = (await db.execute(count_query)).scalar() or 0
    items = (await db.execute(query)).scalars().all()
    return list(items), total

async def get_machine_by_id(db: AsyncSession, machine_id: str) -> Machine:
    uid = uuid.UUID(machine_id)
    stmt = select(Machine).options(
        selectinload(Machine.model),
        selectinload(Machine.qr_code),
        selectinload(Machine.location_associations).selectinload(MachineLocation.location).selectinload(Location.building),
        selectinload(Machine.location_associations).selectinload(MachineLocation.location).selectinload(Location.floor)
    ).where(Machine.id == uid, Machine.is_deleted == False)
    m = (await db.execute(stmt)).scalar_one_or_none()
    if not m:
        raise NotFoundError("Machine", machine_id)
    return m

async def get_machine_by_public_id(db: AsyncSession, public_id: str) -> Machine:
    stmt = select(Machine).options(
        selectinload(Machine.model),
        selectinload(Machine.qr_code),
        selectinload(Machine.location_associations).selectinload(MachineLocation.location).selectinload(Location.building),
        selectinload(Machine.location_associations).selectinload(MachineLocation.location).selectinload(Location.floor)
    ).where(Machine.public_id == public_id, Machine.is_deleted == False)
    m = (await db.execute(stmt)).scalar_one_or_none()
    if not m:
        raise NotFoundError("Machine with Public ID", public_id)
    return m

async def create_machine(db: AsyncSession, data: MachineCreate, user_id: Optional[str] = None) -> Machine:
    # Check duplicate machine_number
    exist_stmt = select(Machine).where(Machine.machine_number == data.machine_number, Machine.is_deleted == False)
    if (await db.execute(exist_stmt)).scalar_one_or_none():
        raise ConflictError(f"Machine with number '{data.machine_number}' already exists")

    # Generate distinct public identifier
    public_id = f"VM-{secrets.token_hex(4).upper()}"

    machine = Machine(
        machine_number=data.machine_number,
        serial_number=data.serial_number,
        model_id=uuid.UUID(data.model_id) if data.model_id else None,
        machine_type=data.machine_type,
        status=data.status,
        data_quality_status=data.data_quality_status,
        quality_notes=data.quality_notes,
        health_score=data.health_score,
        installation_date=data.installation_date,
        next_maintenance_due=data.next_maintenance_due,
        notes=data.notes,
        public_id=public_id
    )
    db.add(machine)
    await db.flush()

    # Generate QR Code record
    qr_url = f"https://vendingfleet.app/scan/{public_id}"
    qr_record = QRCode(
        machine_id=machine.id,
        public_url=qr_url,
        qr_svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="50">{public_id}</text></svg>'
    )
    db.add(qr_record)

    # Assign initial location if provided
    if data.location_id:
        loc_association = MachineLocation(
            machine_id=machine.id,
            location_id=uuid.UUID(data.location_id),
            is_current=True,
            installed_at=datetime.now(timezone.utc)
        )
        db.add(loc_association)

    await log_audit_event(db, "MACHINE_CREATE", "machines", str(machine.id), user_id, new_values={"number": machine.machine_number})
    await db.commit()
    return await get_machine_by_id(db, str(machine.id))

async def update_machine(db: AsyncSession, machine_id: str, data: MachineUpdate, user_id: Optional[str] = None) -> Machine:
    machine = await get_machine_by_id(db, machine_id)
    
    if data.machine_number is not None:
        machine.machine_number = data.machine_number
    if data.serial_number is not None:
        machine.serial_number = data.serial_number
    if data.model_id is not None:
        machine.model_id = uuid.UUID(data.model_id) if data.model_id else None
    if data.machine_type is not None:
        machine.machine_type = data.machine_type
    if data.status is not None:
        machine.status = data.status
    if data.data_quality_status is not None:
        machine.data_quality_status = data.data_quality_status
    if data.quality_notes is not None:
        machine.quality_notes = data.quality_notes
    if data.health_score is not None:
        machine.health_score = data.health_score
    if data.installation_date is not None:
        machine.installation_date = data.installation_date
    if data.next_maintenance_due is not None:
        machine.next_maintenance_due = data.next_maintenance_due
    if data.notes is not None:
        machine.notes = data.notes

    db.add(machine)
    await log_audit_event(db, "MACHINE_UPDATE", "machines", str(machine.id), user_id)
    await db.commit()
    return await get_machine_by_id(db, str(machine.id))

async def relocate_machine(db: AsyncSession, machine_id: str, new_location_id: str, reason: Optional[str] = None, user_id: Optional[str] = None) -> Machine:
    machine = await get_machine_by_id(db, machine_id)
    now = datetime.now(timezone.utc)

    # Deactivate current active location
    curr_stmt = select(MachineLocation).where(
        MachineLocation.machine_id == machine.id,
        MachineLocation.is_current == True
    )
    curr_locs = (await db.execute(curr_stmt)).scalars().all()
    for curr in curr_locs:
        curr.is_current = False
        curr.removed_at = now
        db.add(curr)

    # Insert new location
    new_loc_assoc = MachineLocation(
        machine_id=machine.id,
        location_id=uuid.UUID(new_location_id),
        is_current=True,
        installed_at=now
    )
    db.add(new_loc_assoc)

    await log_audit_event(
        db, "MACHINE_RELOCATE", "machines", str(machine.id), user_id,
        new_values={"new_location_id": new_location_id, "reason": reason}
    )
    await db.commit()
    return await get_machine_by_id(db, str(machine.id))
