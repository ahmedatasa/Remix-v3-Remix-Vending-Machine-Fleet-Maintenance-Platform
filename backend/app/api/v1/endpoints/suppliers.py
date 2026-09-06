from typing import Optional, List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.dependencies import get_db, get_current_active_user, RoleChecker
from backend.app.models.enums import UserRole
from backend.app.models.users import User
from backend.app.schemas.inventory import SupplierCreate, SupplierUpdate, SupplierResponse
from backend.app.services.supplier_service import list_suppliers, get_supplier_by_id, create_supplier, update_supplier

router = APIRouter(prefix="/suppliers", tags=["Suppliers Management"])

admin_or_warehouse = RoleChecker([UserRole.SUPER_ADMIN, UserRole.MAINTENANCE_MANAGER, UserRole.WAREHOUSE_MANAGER])

@router.get(
    "",
    response_model=List[SupplierResponse],
    summary="List Suppliers"
)
async def get_suppliers(
    search: Optional[str] = Query(None, description="Search by name, contact, or email"),
    db: AsyncSession = Depends(get_db)
):
    suppliers = await list_suppliers(db, search=search)
    return [SupplierResponse.from_orm(s) for s in suppliers]

@router.get(
    "/{supplier_id}",
    response_model=SupplierResponse,
    summary="Get Supplier by ID"
)
async def get_supplier(
    supplier_id: str,
    db: AsyncSession = Depends(get_db)
):
    supplier = await get_supplier_by_id(db, supplier_id)
    return SupplierResponse.from_orm(supplier)

@router.post(
    "",
    response_model=SupplierResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Supplier",
    dependencies=[Depends(admin_or_warehouse)]
)
async def create_new_supplier(
    data: SupplierCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    supplier = await create_supplier(db, data, user_id=str(current_user.id))
    return SupplierResponse.from_orm(supplier)

@router.put(
    "/{supplier_id}",
    response_model=SupplierResponse,
    summary="Update Supplier",
    dependencies=[Depends(admin_or_warehouse)]
)
async def update_existing_supplier(
    supplier_id: str,
    data: SupplierUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    supplier = await update_supplier(db, supplier_id, data, user_id=str(current_user.id))
    return SupplierResponse.from_orm(supplier)
