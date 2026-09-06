from backend.app.schemas.common import PaginatedResponse, MessageResponse, ErrorResponse
from backend.app.schemas.auth import LoginRequest, TokenResponse, RefreshTokenRequest, CurrentUserResponse
from backend.app.schemas.users import UserCreate, UserUpdate, UserResponse, PermissionResponse
from backend.app.schemas.buildings import BuildingCreate, BuildingUpdate, BuildingResponse, FloorCreate, FloorResponse, LocationCreate, LocationResponse, LocationDetailResponse
from backend.app.schemas.machines import MachineCreate, MachineUpdate, MachineResponse, MachineDetailResponse, QRCodeResponse, MachineModelCreate, MachineModelResponse
from backend.app.schemas.technicians import TechnicianCreate, TechnicianUpdate, TechnicianResponse, TechnicianDetailResponse
from backend.app.schemas.tickets import TicketCreate, TicketPublicCreate, TicketUpdate, TicketStatusUpdate, TicketResponse, TicketDetailResponse, MaintenanceActionCreate, MaintenanceActionResponse
from backend.app.schemas.inventory import SparePartCreate, SparePartUpdate, SparePartResponse, InventoryTransactionCreate, InventoryTransactionResponse, SparePartRequestCreate, SparePartRequestResponse, SupplierCreate, SupplierResponse
from backend.app.schemas.dashboard import DashboardSummaryResponse, FleetMetricsResponse, MaintenanceKpiResponse
from backend.app.schemas.reports import MTTRReportResponse, RepeatFailureReportResponse, InventoryValuationReportResponse, MachineLifecycleReportResponse
from backend.app.schemas.audit import AuditLogResponse
from backend.app.schemas.notifications import NotificationResponse, NotificationCreate
