from typing import Optional, List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.dependencies import get_db, get_current_active_user, RoleChecker, PaginationParams
from backend.app.models.enums import UserRole, MachineStatus, DataQualityStatus
from backend.app.models.users import User
from backend.app.schemas.machines import (
    MachineCreate, MachineUpdate, MachineResponse, MachineDetailResponse,
    MachineStatusUpdate, RelocateMachineRequest, MachineModelCreate, MachineModelResponse
)
from backend.app.schemas.common import PaginatedResponse, PaginatedMeta
from backend.app.services.machine_service import (
    list_machines, get_machine_by_id, get_machine_by_public_id,
    create_machine, update_machine, relocate_machine,
    list_machine_models, create_machine_model
)

router = APIRouter(prefix="/machines", tags=["Machines Management"])

admin_or_manager = RoleChecker([UserRole.SUPER_ADMIN, UserRole.MAINTENANCE_MANAGER])
technician_or_staff = RoleChecker([UserRole.SUPER_ADMIN, UserRole.MAINTENANCE_MANAGER, UserRole.TECHNICIAN])

@router.get(
    "/models",
    response_model=List[MachineModelResponse],
    summary="List Machine Models"
)
async def get_models(db: AsyncSession = Depends(get_db)):
    models = await list_machine_models(db)
    return [MachineModelResponse.from_orm(m) for m in models]

@router.post(
    "/models",
    response_model=MachineModelResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Machine Model",
    dependencies=[Depends(admin_or_manager)]
)
async def create_model(
    data: MachineModelCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    model = await create_machine_model(db, data, user_id=str(current_user.id))
    return MachineModelResponse.from_orm(model)

@router.get(
    "",
    response_model=PaginatedResponse[MachineResponse],
    summary="List Machines"
)
async def get_machines(
    params: PaginationParams = Depends(),
    status: Optional[MachineStatus] = Query(None, description="Filter by status"),
    quality_status: Optional[DataQualityStatus] = Query(None, description="Filter by data quality status"),
    db: AsyncSession = Depends(get_db)
):
    machines, total = await list_machines(
        db=db,
        offset=params.offset,
        limit=params.page_size,
        status=status,
        quality_status=quality_status,
        search=params.search
    )
    total_pages = (total + params.page_size - 1) // params.page_size if total > 0 else 0
    return PaginatedResponse(
        items=[MachineResponse.from_orm(m) for m in machines],
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
    "/public/{public_id}",
    response_model=MachineResponse,
    summary="Get Machine by Public ID (For QR Scanner)"
)
async def get_machine_public(
    public_id: str,
    db: AsyncSession = Depends(get_db)
):
    machine = await get_machine_by_public_id(db, public_id)
    return MachineResponse.from_orm(machine)

@router.get(
    "/{machine_id}",
    response_model=MachineDetailResponse,
    summary="Get Machine Details"
)
async def get_machine(
    machine_id: str,
    db: AsyncSession = Depends(get_db)
):
    machine = await get_machine_by_id(db, machine_id)
    return MachineDetailResponse.from_orm(machine)

@router.post(
    "",
    response_model=MachineResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Machine",
    dependencies=[Depends(admin_or_manager)]
)
async def create_new_machine(
    data: MachineCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    machine = await create_machine(db, data, user_id=str(current_user.id))
    return MachineResponse.from_orm(machine)

@router.put(
    "/{machine_id}",
    response_model=MachineResponse,
    summary="Update Machine",
    dependencies=[Depends(admin_or_manager)]
)
async def update_existing_machine(
    machine_id: str,
    data: MachineUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    machine = await update_machine(db, machine_id, data, user_id=str(current_user.id))
    return MachineResponse.from_orm(machine)

@router.post(
    "/{machine_id}/relocate",
    response_model=MachineResponse,
    summary="Relocate Machine to New Location",
    dependencies=[Depends(admin_or_manager)]
)
async def relocate_existing_machine(
    machine_id: str,
    data: RelocateMachineRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    machine = await relocate_machine(db, machine_id, data.location_id, data.reason, user_id=str(current_user.id))
    return MachineResponse.from_orm(machine)
