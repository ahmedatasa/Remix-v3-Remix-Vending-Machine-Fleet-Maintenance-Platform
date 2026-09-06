from typing import Optional, List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.dependencies import get_db, get_current_active_user, RoleChecker
from backend.app.models.enums import UserRole, PartRequestStatus
from backend.app.models.users import User
from backend.app.schemas.inventory import (
    SparePartRequestCreate, SparePartRequestStatusUpdate, SparePartRequestResponse
)
from backend.app.services.inventory_service import (
    list_part_requests, create_part_request, update_part_request_status
)

router = APIRouter(prefix="/part-requests", tags=["Spare Part Requests"])

tech_or_manager = RoleChecker([UserRole.SUPER_ADMIN, UserRole.MAINTENANCE_MANAGER, UserRole.TECHNICIAN, UserRole.WAREHOUSE_MANAGER])
admin_or_warehouse = RoleChecker([UserRole.SUPER_ADMIN, UserRole.MAINTENANCE_MANAGER, UserRole.WAREHOUSE_MANAGER])

@router.get(
    "",
    response_model=List[SparePartRequestResponse],
    summary="List Spare Part Requests",
    dependencies=[Depends(tech_or_manager)]
)
async def get_part_requests(
    ticket_id: Optional[str] = Query(None, description="Filter by ticket ID"),
    status: Optional[PartRequestStatus] = Query(None, description="Filter by request status"),
    db: AsyncSession = Depends(get_db)
):
    requests = await list_part_requests(db, ticket_id=ticket_id, status=status)
    return [SparePartRequestResponse.from_orm(r) for r in requests]

@router.post(
    "",
    response_model=SparePartRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Request Spare Part for Ticket",
    dependencies=[Depends(tech_or_manager)]
)
async def submit_part_request(
    data: SparePartRequestCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    req = await create_part_request(db, data, technician_user_id=str(current_user.id))
    return SparePartRequestResponse.from_orm(req)

@router.post(
    "/{request_id}/status",
    response_model=SparePartRequestResponse,
    summary="Update Part Request Status (Approve/Issue/Reject)",
    dependencies=[Depends(admin_or_warehouse)]
)
async def change_request_status(
    request_id: str,
    data: SparePartRequestStatusUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    req = await update_part_request_status(db, request_id, data, user_id=str(current_user.id))
    return SparePartRequestResponse.from_orm(req)
