from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.dependencies import get_db, RoleChecker
from backend.app.models.enums import UserRole
from backend.app.schemas.users import PermissionResponse
from backend.app.services.user_service import list_permissions

router = APIRouter(prefix="/roles-permissions", tags=["Roles & Permissions"])

admin_or_manager = RoleChecker([UserRole.SUPER_ADMIN, UserRole.MAINTENANCE_MANAGER])

@router.get(
    "/roles",
    response_model=List[str],
    summary="List System Roles",
    dependencies=[Depends(admin_or_manager)]
)
async def get_roles():
    """List all available predefined user roles in the RBAC hierarchy."""
    return [role.value for role in UserRole]

@router.get(
    "/permissions",
    response_model=List[PermissionResponse],
    summary="List System Permissions",
    dependencies=[Depends(admin_or_manager)]
)
async def get_permissions(db: AsyncSession = Depends(get_db)):
    """List all granular system permissions categorized by functional module."""
    perms = await list_permissions(db)
    return [PermissionResponse.from_orm(p) for p in perms]
