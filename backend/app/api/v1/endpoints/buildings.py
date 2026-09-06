from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.dependencies import get_db, get_current_active_user, RoleChecker
from backend.app.models.enums import UserRole
from backend.app.models.users import User
from backend.app.schemas.buildings import BuildingCreate, BuildingUpdate, BuildingResponse, FloorResponse
from backend.app.services.location_service import list_buildings, get_building_by_id, create_building, update_building, list_floors_by_building

router = APIRouter(prefix="/buildings", tags=["Buildings"])

admin_or_manager = RoleChecker([UserRole.SUPER_ADMIN, UserRole.MAINTENANCE_MANAGER])

@router.get(
    "",
    response_model=List[BuildingResponse],
    summary="List Buildings"
)
async def get_buildings(
    search: Optional[str] = Query(None, description="Search by building name or code"),
    db: AsyncSession = Depends(get_db)
):
    buildings = await list_buildings(db, search=search)
    return [BuildingResponse.from_orm(b) for b in buildings]

@router.get(
    "/{building_id}",
    response_model=BuildingResponse,
    summary="Get Building by ID"
)
async def get_building(
    building_id: str,
    db: AsyncSession = Depends(get_db)
):
    building = await get_building_by_id(db, building_id)
    return BuildingResponse.from_orm(building)

@router.get(
    "/{building_id}/floors",
    response_model=List[FloorResponse],
    summary="List Floors in Building"
)
async def get_floors_for_building(
    building_id: str,
    db: AsyncSession = Depends(get_db)
):
    floors = await list_floors_by_building(db, building_id)
    return [FloorResponse.from_orm(f) for f in floors]

@router.post(
    "",
    response_model=BuildingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Building",
    dependencies=[Depends(admin_or_manager)]
)
async def create_new_building(
    data: BuildingCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    building = await create_building(db, data, user_id=str(current_user.id))
    return BuildingResponse.from_orm(building)

@router.put(
    "/{building_id}",
    response_model=BuildingResponse,
    summary="Update Building",
    dependencies=[Depends(admin_or_manager)]
)
async def update_existing_building(
    building_id: str,
    data: BuildingUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    building = await update_building(db, building_id, data, user_id=str(current_user.id))
    return BuildingResponse.from_orm(building)
