from typing import Optional, List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.dependencies import get_db, get_current_active_user, RoleChecker, PaginationParams
from backend.app.models.enums import UserRole
from backend.app.models.users import User
from backend.app.schemas.inventory import (
    SparePartCreate, SparePartUpdate, SparePartResponse,
    SparePartCategoryCreate, SparePartCategoryResponse
)
from backend.app.schemas.common import PaginatedResponse, PaginatedMeta
from backend.app.services.inventory_service import (
    list_spare_parts, get_spare_part_by_id, create_spare_part,
    update_spare_part, list_categories, create_category
)

router = APIRouter(prefix="/spare-parts", tags=["Spare Parts Catalog"])

admin_or_warehouse = RoleChecker([UserRole.SUPER_ADMIN, UserRole.MAINTENANCE_MANAGER, UserRole.WAREHOUSE_MANAGER])

@router.get(
    "/categories",
    response_model=List[SparePartCategoryResponse],
    summary="List Spare Part Categories"
)
async def get_categories(db: AsyncSession = Depends(get_db)):
    cats = await list_categories(db)
    return [SparePartCategoryResponse.from_orm(c) for c in cats]

@router.post(
    "/categories",
    response_model=SparePartCategoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Spare Part Category",
    dependencies=[Depends(admin_or_warehouse)]
)
async def create_new_category(
    data: SparePartCategoryCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    cat = await create_category(db, data, user_id=str(current_user.id))
    return SparePartCategoryResponse.from_orm(cat)

@router.get(
    "",
    response_model=PaginatedResponse[SparePartResponse],
    summary="List Spare Parts Catalog"
)
async def get_parts(
    params: PaginationParams = Depends(),
    category_id: Optional[str] = Query(None, description="Filter by category"),
    low_stock_only: bool = Query(False, description="Filter for low stock parts"),
    db: AsyncSession = Depends(get_db)
):
    parts, total = await list_spare_parts(
        db=db,
        offset=params.offset,
        limit=params.page_size,
        category_id=category_id,
        low_stock_only=low_stock_only,
        search=params.search
    )
    total_pages = (total + params.page_size - 1) // params.page_size if total > 0 else 0
    return PaginatedResponse(
        items=[SparePartResponse.from_orm(p) for p in parts],
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
    "/{part_id}",
    response_model=SparePartResponse,
    summary="Get Spare Part by ID"
)
async def get_part(
    part_id: str,
    db: AsyncSession = Depends(get_db)
):
    part = await get_spare_part_by_id(db, part_id)
    return SparePartResponse.from_orm(part)

@router.post(
    "",
    response_model=SparePartResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Spare Part SKU",
    dependencies=[Depends(admin_or_warehouse)]
)
async def create_new_part(
    data: SparePartCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    part = await create_spare_part(db, data, user_id=str(current_user.id))
    return SparePartResponse.from_orm(part)

@router.put(
    "/{part_id}",
    response_model=SparePartResponse,
    summary="Update Spare Part SKU",
    dependencies=[Depends(admin_or_warehouse)]
)
async def update_existing_part(
    part_id: str,
    data: SparePartUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    part = await update_spare_part(db, part_id, data, user_id=str(current_user.id))
    return SparePartResponse.from_orm(part)
