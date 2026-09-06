import uuid
from typing import List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from backend.app.models.buildings import Building, Floor, Location, MachineLocation
from backend.app.schemas.buildings import BuildingCreate, BuildingUpdate, FloorCreate, FloorUpdate, LocationCreate, LocationUpdate
from backend.app.core.exceptions import NotFoundError, ConflictError
from backend.app.services.audit_service import log_audit_event

# --- Buildings ---
async def list_buildings(db: AsyncSession, search: Optional[str] = None) -> List[Building]:
    stmt = select(Building).where(Building.is_deleted == False)
    if search:
        stmt = stmt.where(or_(Building.name.ilike(f"%{search}%"), Building.code.ilike(f"%{search}%")))
    stmt = stmt.order_by(Building.name.asc())
    return list((await db.execute(stmt)).scalars().all())

async def get_building_by_id(db: AsyncSession, building_id: str) -> Building:
    uid = uuid.UUID(building_id)
    stmt = select(Building).where(Building.id == uid, Building.is_deleted == False)
    b = (await db.execute(stmt)).scalar_one_or_none()
    if not b:
        raise NotFoundError("Building", building_id)
    return b

async def create_building(db: AsyncSession, data: BuildingCreate, user_id: Optional[str] = None) -> Building:
    b = Building(
        name=data.name,
        name_ar=data.name_ar,
        code=data.code,
        address=data.address
    )
    db.add(b)
    await db.flush()
    await log_audit_event(db, "BUILDING_CREATE", "buildings", str(b.id), user_id, new_values={"name": b.name})
    await db.commit()
    return b

async def update_building(db: AsyncSession, building_id: str, data: BuildingUpdate, user_id: Optional[str] = None) -> Building:
    b = await get_building_by_id(db, building_id)
    if data.name is not None:
        b.name = data.name
    if data.name_ar is not None:
        b.name_ar = data.name_ar
    if data.code is not None:
        b.code = data.code
    if data.address is not None:
        b.address = data.address
    db.add(b)
    await log_audit_event(db, "BUILDING_UPDATE", "buildings", str(b.id), user_id)
    await db.commit()
    return b

# --- Floors ---
async def list_floors_by_building(db: AsyncSession, building_id: str) -> List[Floor]:
    b_uid = uuid.UUID(building_id)
    stmt = select(Floor).where(Floor.building_id == b_uid, Floor.is_deleted == False).order_by(Floor.level_order.asc())
    return list((await db.execute(stmt)).scalars().all())

async def get_floor_by_id(db: AsyncSession, floor_id: str) -> Floor:
    uid = uuid.UUID(floor_id)
    stmt = select(Floor).where(Floor.id == uid, Floor.is_deleted == False)
    f = (await db.execute(stmt)).scalar_one_or_none()
    if not f:
        raise NotFoundError("Floor", floor_id)
    return f

async def create_floor(db: AsyncSession, data: FloorCreate, user_id: Optional[str] = None) -> Floor:
    await get_building_by_id(db, data.building_id)
    f = Floor(
        building_id=uuid.UUID(data.building_id),
        floor_number=data.floor_number or 0,
        floor_name=data.floor_name,
        floor_name_ar=data.floor_name_ar,
        level_order=data.level_order
    )
    db.add(f)
    await db.flush()
    await log_audit_event(db, "FLOOR_CREATE", "floors", str(f.id), user_id)
    await db.commit()
    return f

# --- Locations ---
async def list_locations(
    db: AsyncSession,
    offset: int = 0,
    limit: int = 50,
    building_id: Optional[str] = None,
    floor_id: Optional[str] = None,
    search: Optional[str] = None
) -> Tuple[List[Location], int]:
    query = select(Location).options(
        selectinload(Location.building),
        selectinload(Location.floor)
    ).where(Location.is_deleted == False)
    
    count_query = select(func.count(Location.id)).where(Location.is_deleted == False)

    if building_id:
        b_uid = uuid.UUID(building_id)
        query = query.where(Location.building_id == b_uid)
        count_query = count_query.where(Location.building_id == b_uid)

    if floor_id:
        f_uid = uuid.UUID(floor_id)
        query = query.where(Location.floor_id == f_uid)
        count_query = count_query.where(Location.floor_id == f_uid)

    if search:
        search_filter = or_(
            Location.area_zone.ilike(f"%{search}%"),
            Location.full_description.ilike(f"%{search}%")
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    query = query.order_by(Location.full_description.asc()).offset(offset).limit(limit)

    total = (await db.execute(count_query)).scalar() or 0
    items = (await db.execute(query)).scalars().all()
    return list(items), total

async def get_location_by_id(db: AsyncSession, location_id: str) -> Location:
    uid = uuid.UUID(location_id)
    stmt = select(Location).options(
        selectinload(Location.building),
        selectinload(Location.floor)
    ).where(Location.id == uid, Location.is_deleted == False)
    loc = (await db.execute(stmt)).scalar_one_or_none()
    if not loc:
        raise NotFoundError("Location", location_id)
    return loc

async def create_location(db: AsyncSession, data: LocationCreate, user_id: Optional[str] = None) -> Location:
    await get_building_by_id(db, data.building_id)
    if data.floor_id:
        await get_floor_by_id(db, data.floor_id)

    loc = Location(
        building_id=uuid.UUID(data.building_id),
        floor_id=uuid.UUID(data.floor_id) if data.floor_id else None,
        area_zone=data.area_zone,
        area_zone_ar=data.area_zone_ar,
        full_description=data.full_description,
        original_raw_text=data.original_raw_text or data.full_description,
        is_active=data.is_active
    )
    db.add(loc)
    await db.flush()
    await log_audit_event(db, "LOCATION_CREATE", "locations", str(loc.id), user_id)
    await db.commit()
    return await get_location_by_id(db, str(loc.id))
