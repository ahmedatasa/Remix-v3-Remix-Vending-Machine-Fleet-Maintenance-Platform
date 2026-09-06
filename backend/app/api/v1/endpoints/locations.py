from typing import Optional, List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.dependencies import get_db, get_current_active_user, RoleChecker, PaginationParams
from backend.app.models.enums import UserRole
from backend.app.models.users import User
from backend.app.schemas.buildings import LocationCreate, LocationResponse, LocationDetailResponse
from backend.app.schemas.common import PaginatedResponse, PaginatedMeta
from backend.app.services.location_service import list_locations, get_location_by_id, create_location

router = APIRouter(prefix="/locations", tags=["Locations"])

admin_or_manager = RoleChecker([UserRole.SUPER_ADMIN, UserRole.MAINTENANCE_MANAGER])

@router.get(
    "",
    response_model=PaginatedResponse[LocationDetailResponse],
    summary="List Locations with Hierarchy"
)
async def get_locations(
    params: PaginationParams = Depends(),
    building_id: Optional[str] = Query(None, description="Filter by building ID"),
    floor_id: Optional[str] = Query(None, description="Filter by floor ID"),
    db: AsyncSession = Depends(get_db)
):
    locations, total = await list_locations(
        db=db,
        offset=params.offset,
        limit=params.page_size,
        building_id=building_id,
        floor_id=floor_id,
        search=params.search
    )
    total_pages = (total + params.page_size - 1) // params.page_size if total > 0 else 0
    return PaginatedResponse(
        items=[LocationDetailResponse.from_orm(loc) for loc in locations],
        meta=PaginatedMeta(
            page=params.page,
            page_size=params.page_size,
            total_records=total,
            total_pages=total_pages,
            has_next=params.page < total_pages,
            has_previous=params.page > 1
        )
    )

@router.get(
    "/{location_id}",
    response_model=LocationDetailResponse,
    summary="Get Location by ID"
)
async def get_location(
    location_id: str,
    db: AsyncSession = Depends(get_db)
):
    loc = await get_location_by_id(db, location_id)
    return LocationDetailResponse.from_orm(loc)

@router.post(
    "",
    response_model=LocationDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Location",
    dependencies=[Depends(admin_or_manager)]
)
async def create_new_location(
    data: LocationCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    loc = await create_location(db, data, user_id=str(current_user.id))
    return LocationDetailResponse.from_orm(loc)
