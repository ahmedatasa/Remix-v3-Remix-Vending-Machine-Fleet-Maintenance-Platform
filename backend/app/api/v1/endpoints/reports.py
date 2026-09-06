from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.dependencies import get_db, RoleChecker
from backend.app.models.enums import UserRole
from backend.app.schemas.reports import (
    MTTRReportResponse, RepeatFailureReportResponse,
    InventoryValuationReportResponse, MachineLifecycleReportResponse
)
from backend.app.services.report_service import (
    generate_mttr_report, generate_repeat_failures_report,
    generate_inventory_valuation_report, generate_machine_lifecycle_report
)

router = APIRouter(prefix="/reports", tags=["Analytics & Reports"])

management_roles = RoleChecker([UserRole.SUPER_ADMIN, UserRole.MAINTENANCE_MANAGER, UserRole.FACILITY_MANAGER])

@router.get(
    "/mttr",
    response_model=MTTRReportResponse,
    summary="Mean Time to Resolution (MTTR) & SLA Breach Report",
    dependencies=[Depends(management_roles)]
)
async def get_mttr(db: AsyncSession = Depends(get_db)):
    return await generate_mttr_report(db)

@router.get(
    "/chronic-failures",
    response_model=RepeatFailureReportResponse,
    summary="Repeat & Chronic Failure Machines (Last 30 Days)",
    dependencies=[Depends(management_roles)]
)
async def get_chronic_failures(db: AsyncSession = Depends(get_db)):
    return await generate_repeat_failures_report(db)

@router.get(
    "/inventory-valuation",
    response_model=InventoryValuationReportResponse,
    summary="Spare Parts Inventory Valuation & Stock Value",
    dependencies=[Depends(management_roles)]
)
async def get_inventory_valuation(db: AsyncSession = Depends(get_db)):
    return await generate_inventory_valuation_report(db)

@router.get(
    "/machine-lifecycle",
    response_model=MachineLifecycleReportResponse,
    summary="Machine Total Cost of Ownership (TCO) & Lifecycle",
    dependencies=[Depends(management_roles)]
)
async def get_machine_lifecycle(db: AsyncSession = Depends(get_db)):
    return await generate_machine_lifecycle_report(db)
