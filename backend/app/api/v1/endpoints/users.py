from typing import Optional, List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.dependencies import get_db, get_current_active_user, RoleChecker, PaginationParams
from backend.app.models.enums import UserRole
from backend.app.models.users import User
from backend.app.schemas.users import UserCreate, UserUpdate, UserResponse
from backend.app.schemas.common import PaginatedResponse, PaginatedMeta, MessageResponse
from backend.app.services.user_service import list_users, get_user_by_id, create_user, update_user, soft_delete_user

router = APIRouter(prefix="/users", tags=["Users Management"])

# Permissions: Admin and Manager
admin_or_manager = RoleChecker([UserRole.SUPER_ADMIN, UserRole.MAINTENANCE_MANAGER])
admin_only = RoleChecker([UserRole.SUPER_ADMIN])

@router.get(
    "",
    response_model=PaginatedResponse[UserResponse],
    summary="List Users",
    dependencies=[Depends(admin_or_manager)]
)
async def get_users(
    params: PaginationParams = Depends(),
    role: Optional[UserRole] = Query(None, description="Filter by user role"),
    db: AsyncSession = Depends(get_db)
):
    users, total = await list_users(
        db=db,
        offset=params.offset,
        limit=params.page_size,
        search=params.search,
        role=role
    )
    total_pages = (total + params.page_size - 1) // params.page_size if total > 0 else 0
    return PaginatedResponse(
        items=[UserResponse.from_orm(u) for u in users],
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
    "/{user_id}",
    response_model=UserResponse,
    summary="Get User By ID",
    dependencies=[Depends(admin_or_manager)]
)
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db)
):
    user = await get_user_by_id(db, user_id)
    return UserResponse.from_orm(user)

@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create User",
    dependencies=[Depends(admin_only)]
)
async def create_new_user(
    user_in: UserCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    user = await create_user(db, user_in, creator_id=str(current_user.id))
    return UserResponse.from_orm(user)

@router.put(
    "/{user_id}",
    response_model=UserResponse,
    summary="Update User",
    dependencies=[Depends(admin_only)]
)
async def update_existing_user(
    user_id: str,
    user_in: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    user = await update_user(db, user_id, user_in, updater_id=str(current_user.id))
    return UserResponse.from_orm(user)

@router.delete(
    "/{user_id}",
    response_model=MessageResponse,
    summary="Delete User (Soft Delete)",
    dependencies=[Depends(admin_only)]
)
async def delete_user(
    user_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    await soft_delete_user(db, user_id, deleter_id=str(current_user.id))
    return MessageResponse(message=f"User {user_id} successfully deleted")
