from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.dependencies import get_db, get_current_active_user, RoleChecker
from backend.app.models.enums import UserRole
from backend.app.schemas.dashboard import DashboardSummaryResponse
from backend.app.services.dashboard_service import get_dashboard_summary

router = APIRouter(prefix="/dashboard", tags=["Executive Dashboard"])

staff_roles = RoleChecker([
    UserRole.SUPER_ADMIN,
    UserRole.MAINTENANCE_MANAGER,
    UserRole.FACILITY_MANAGER,
    UserRole.TECHNICIAN,
    UserRole.WAREHOUSE_MANAGER,
    UserRole.VIEWER
])

@router.get(
    "/summary",
    response_model=DashboardSummaryResponse,
    summary="Get Fleet Overview, KPIs, Workload & Alerts",
    dependencies=[Depends(staff_roles)]
)
async def get_summary(db: AsyncSession = Depends(get_db)):
    """
    Returns unified real-time dashboard telemetry:
    - Fleet operational status & health score
    - Maintenance MTTR, MTBF, SLA compliance
    - Active tickets categorized by priority & fault type
    - Technician active ticket assignments
    - Warehouse low-stock SKU deficit warnings
    """
    return await get_dashboard_summary(db)
