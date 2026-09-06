from typing import Optional, List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.dependencies import get_db, get_current_active_user, RoleChecker, PaginationParams
from backend.app.models.enums import UserRole, TicketStatus, TicketPriority, FaultCategory
from backend.app.models.users import User
from backend.app.schemas.tickets import (
    TicketCreate, TicketPublicCreate, TicketUpdate, TicketStatusUpdate,
    TicketAssignRequest, TicketResponse, TicketDetailResponse,
    MaintenanceActionCreate, MaintenanceActionResponse
)
from backend.app.schemas.common import PaginatedResponse, PaginatedMeta
from backend.app.services.ticket_service import (
    list_tickets, get_ticket_by_id, create_ticket, create_public_qr_report,
    assign_ticket, update_ticket_status, add_maintenance_action
)

router = APIRouter(prefix="/tickets", tags=["Tickets & Maintenance"])

admin_or_manager = RoleChecker([UserRole.SUPER_ADMIN, UserRole.MAINTENANCE_MANAGER])
tech_or_manager = RoleChecker([UserRole.SUPER_ADMIN, UserRole.MAINTENANCE_MANAGER, UserRole.TECHNICIAN])

@router.get(
    "",
    response_model=PaginatedResponse[TicketResponse],
    summary="List Tickets"
)
async def get_tickets(
    params: PaginationParams = Depends(),
    status: Optional[TicketStatus] = Query(None, description="Filter by status"),
    priority: Optional[TicketPriority] = Query(None, description="Filter by priority"),
    category: Optional[FaultCategory] = Query(None, description="Filter by fault category"),
    technician_id: Optional[str] = Query(None, description="Filter by assigned technician"),
    machine_id: Optional[str] = Query(None, description="Filter by machine"),
    db: AsyncSession = Depends(get_db)
):
    tickets, total = await list_tickets(
        db=db,
        offset=params.offset,
        limit=params.page_size,
        status=status,
        priority=priority,
        category=category,
        technician_id=technician_id,
        machine_id=machine_id,
        search=params.search
    )
    total_pages = (total + params.page_size - 1) // params.page_size if total > 0 else 0
    return PaginatedResponse(
        items=[TicketResponse.from_orm(t) for t in tickets],
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
    "/{ticket_id}",
    response_model=TicketDetailResponse,
    summary="Get Ticket Details with Audit History & Maintenance Actions"
)
async def get_ticket(
    ticket_id: str,
    db: AsyncSession = Depends(get_db)
):
    ticket = await get_ticket_by_id(db, ticket_id)
    return TicketDetailResponse.from_orm(ticket)

@router.post(
    "",
    response_model=TicketResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Ticket (Internal)",
    dependencies=[Depends(tech_or_manager)]
)
async def create_internal_ticket(
    data: TicketCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    ticket = await create_ticket(db, data, user_id=str(current_user.id))
    return TicketResponse.from_orm(ticket)

@router.post(
    "/public-report",
    response_model=TicketResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit Customer QR Code Issue Report (Public - No Auth)"
)
async def submit_public_report(
    data: TicketPublicCreate,
    db: AsyncSession = Depends(get_db)
):
    ticket = await create_public_qr_report(db, data)
    return TicketResponse.from_orm(ticket)

@router.post(
    "/{ticket_id}/assign",
    response_model=TicketResponse,
    summary="Assign Ticket to Technician",
    dependencies=[Depends(admin_or_manager)]
)
async def assign_ticket_endpoint(
    ticket_id: str,
    data: TicketAssignRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    ticket = await assign_ticket(db, ticket_id, data.technician_id, data.comment, user_id=str(current_user.id))
    return TicketResponse.from_orm(ticket)

@router.post(
    "/{ticket_id}/status",
    response_model=TicketResponse,
    summary="Update Ticket Status (e.g. IN_PROGRESS, RESOLVED, CLOSED)",
    dependencies=[Depends(tech_or_manager)]
)
async def update_status_endpoint(
    ticket_id: str,
    data: TicketStatusUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    ticket = await update_ticket_status(db, ticket_id, data, user_id=str(current_user.id))
    return TicketResponse.from_orm(ticket)

@router.post(
    "/{ticket_id}/actions",
    response_model=MaintenanceActionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record Maintenance Action & Parts Used",
    dependencies=[Depends(tech_or_manager)]
)
async def record_action_endpoint(
    ticket_id: str,
    data: MaintenanceActionCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    action = await add_maintenance_action(db, ticket_id, data, user_id=str(current_user.id))
    return MaintenanceActionResponse.from_orm(action)
