from backend.app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin
from backend.app.models.enums import (
    UserRole,
    MachineStatus,
    DataQualityStatus,
    TicketSource,
    TicketStatus,
    TicketPriority,
    FaultCategory,
    TechnicianStatus,
    InventoryTransactionType,
    PartRequestStatus,
    NotificationType,
)
from backend.app.models.users import User, Permission, RolePermission
from backend.app.models.buildings import Building, Floor, Location, MachineLocation
from backend.app.models.machines import MachineModel, Machine, MachineFailureEvent
from backend.app.models.qr_codes import QRCode
from backend.app.models.technicians import Technician
from backend.app.models.tickets import Ticket, TicketStatusHistory, TicketAttachment, MaintenanceAction
from backend.app.models.inventory import SparePartCategory, SparePart, InventoryTransaction, SparePartRequest
from backend.app.models.suppliers import Supplier
from backend.app.models.imports import Import, ImportRow
from backend.app.models.audit import AuditLog
from backend.app.models.notifications import Notification

__all__ = [
    "Base",
    "UUIDPrimaryKeyMixin",
    "TimestampMixin",
    "SoftDeleteMixin",
    "UserRole",
    "MachineStatus",
    "DataQualityStatus",
    "TicketSource",
    "TicketStatus",
    "TicketPriority",
    "FaultCategory",
    "TechnicianStatus",
    "InventoryTransactionType",
    "PartRequestStatus",
    "NotificationType",
    "User",
    "Permission",
    "RolePermission",
    "Building",
    "Floor",
    "Location",
    "MachineLocation",
    "MachineModel",
    "Machine",
    "MachineFailureEvent",
    "QRCode",
    "Technician",
    "Ticket",
    "TicketStatusHistory",
    "TicketAttachment",
    "MaintenanceAction",
    "SparePartCategory",
    "SparePart",
    "InventoryTransaction",
    "SparePartRequest",
    "Supplier",
    "Import",
    "ImportRow",
    "AuditLog",
    "Notification",
]
