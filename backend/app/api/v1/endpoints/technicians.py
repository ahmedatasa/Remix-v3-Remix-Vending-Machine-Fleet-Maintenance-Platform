from typing import Optional, List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.dependencies import get_db, get_current_active_user, RoleChecker
from backend.app.models.enums import UserRole, TechnicianStatus
from backend.app.models.users import User
from backend.app.schemas.technicians import TechnicianCreate, TechnicianUpdate, TechnicianResponse, TechnicianDetailResponse
from backend.app.services.technician_service import list_technicians, get_technician_by_id, create_technician, update_technician, get_technician_active_workload

router = APIRouter(prefix="/technicians", tags=["Technicians Management"])

admin_or_manager = RoleChecker([UserRole.SUPER_ADMIN, UserRole.MAINTENANCE_MANAGER])

@router.get(
    "",
    response_model=List[TechnicianResponse],
    summary="List Technicians"
)
async def get_technicians(
    status: Optional[TechnicianStatus] = Query(None, description="Filter by status"),
    search: Optional[str] = Query(None, description="Search by code or specialization"),
    db: AsyncSession = Depends(get_db)
):
    techs = await list_technicians(db, status=status, search=search)
    return [TechnicianResponse.from_orm(t) for t in techs]

@router.get(
    "/{technician_id}",
    response_model=TechnicianDetailResponse,
    summary="Get Technician Details & Workload"
)
async def get_technician(
    technician_id: str,
    db: AsyncSession = Depends(get_db)
):
    tech = await get_technician_by_id(db, technician_id)
    workload = await get_technician_active_workload(db, technician_id)
    res = TechnicianDetailResponse.from_orm(tech)
    res.active_tickets_count = workload
    return res

@router.post(
    "",
    response_model=TechnicianResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Technician Profile",
    dependencies=[Depends(admin_or_manager)]
)
async def create_new_technician(
    data: TechnicianCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    tech = await create_technician(db, data, creator_id=str(current_user.id))
    return TechnicianResponse.from_orm(tech)

@router.put(
    "/{technician_id}",
    response_model=TechnicianResponse,
    summary="Update Technician Profile",
    dependencies=[Depends(admin_or_manager)]
)
async def update_existing_technician(
    technician_id: str,
    data: TechnicianUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    tech = await update_technician(db, technician_id, data, user_id=str(current_user.id))
    return TechnicianResponse.from_orm(tech)
