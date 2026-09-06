from typing import Optional, List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from backend.app.core.dependencies import get_db, get_current_active_user, RoleChecker, PaginationParams
from backend.app.models.enums import UserRole
from backend.app.models.users import User
from backend.app.models.inventory import InventoryTransaction
from backend.app.schemas.inventory import InventoryTransactionCreate, InventoryTransactionResponse
from backend.app.schemas.common import PaginatedResponse, PaginatedMeta
from backend.app.services.inventory_service import create_inventory_transaction

router = APIRouter(prefix="/inventory", tags=["Inventory Transactions"])

admin_or_warehouse = RoleChecker([UserRole.SUPER_ADMIN, UserRole.MAINTENANCE_MANAGER, UserRole.WAREHOUSE_MANAGER])

@router.get(
    "/transactions",
    response_model=PaginatedResponse[InventoryTransactionResponse],
    summary="List Inventory Stock Transactions",
    dependencies=[Depends(admin_or_warehouse)]
)
async def get_inventory_transactions(
    params: PaginationParams = Depends(),
    part_id: Optional[str] = Query(None, description="Filter by part ID"),
    db: AsyncSession = Depends(get_db)
):
    query = select(InventoryTransaction).options(
        selectinload(InventoryTransaction.part),
        selectinload(InventoryTransaction.user)
    )
    count_query = select(func.count(InventoryTransaction.id))

    if part_id:
        import uuid
        p_uid = uuid.UUID(part_id)
        query = query.where(InventoryTransaction.part_id == p_uid)
        count_query = count_query.where(InventoryTransaction.part_id == p_uid)

    query = query.order_by(InventoryTransaction.created_at.desc()).offset(params.offset).limit(params.page_size)

    total = (await db.execute(count_query)).scalar() or 0
    items = (await db.execute(query)).scalars().all()
    total_pages = (total + params.page_size - 1) // params.page_size if total > 0 else 0

    return PaginatedResponse(
        items=[InventoryTransactionResponse.from_orm(tx) for tx in items],
        meta=PaginatedMeta(
            page=params.page,
            page_size=params.page_size,
            total_records=total,
            total_pages=total_pages,
            has_next=params.page < total_pages,
            has_previous=params.page > 1
        )
    )

@router.post(
    "/adjust",
    response_model=InventoryTransactionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Post Inventory Stock Adjustment / Transaction",
    dependencies=[Depends(admin_or_warehouse)]
)
async def post_stock_adjustment(
    data: InventoryTransactionCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    tx = await create_inventory_transaction(db, data, user_id=str(current_user.id))
    return InventoryTransactionResponse.from_orm(tx)
