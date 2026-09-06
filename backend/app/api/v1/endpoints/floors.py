from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.dependencies import get_db, get_current_active_user, RoleChecker
from backend.app.models.enums import UserRole
from backend.app.models.users import User
from backend.app.schemas.buildings import FloorCreate, FloorResponse
from backend.app.services.location_service import create_floor, get_floor_by_id

router = APIRouter(prefix="/floors", tags=["Floors"])

admin_or_manager = RoleChecker([UserRole.SUPER_ADMIN, UserRole.MAINTENANCE_MANAGER])

@router.post(
    "",
    response_model=FloorResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Floor",
    dependencies=[Depends(admin_or_manager)]
)
async def create_new_floor(
    data: FloorCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    floor = await create_floor(db, data, user_id=str(current_user.id))
    return FloorResponse.from_orm(floor)

@router.get(
    "/{floor_id}",
    response_model=FloorResponse,
    summary="Get Floor by ID"
)
async def get_floor(
    floor_id: str,
    db: AsyncSession = Depends(get_db)
):
    floor = await get_floor_by_id(db, floor_id)
    return FloorResponse.from_orm(floor)
