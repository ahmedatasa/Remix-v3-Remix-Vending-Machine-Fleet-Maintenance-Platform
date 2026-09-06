from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from backend.app.models.enums import TicketSource, TicketStatus, TicketPriority, FaultCategory
from backend.app.schemas.machines import MachineResponse
from backend.app.schemas.buildings import LocationResponse
from backend.app.schemas.technicians import TechnicianResponse
from backend.app.schemas.users import UserResponse

class TicketBase(BaseModel):
    category: FaultCategory = FaultCategory.OTHER
    priority: TicketPriority = TicketPriority.MEDIUM
    description: str = Field(..., min_length=5)
    reporter_name: Optional[str] = None
    reporter_phone: Optional[str] = None

class TicketCreate(TicketBase):
    machine_id: str
    location_id: Optional[str] = None
    source: TicketSource = TicketSource.MANUAL
    assigned_technician_id: Optional[str] = None

class TicketPublicCreate(BaseModel):
    """Customer-facing scan report submission schema (no auth required)."""
    machine_public_id: str
    category: FaultCategory
    description: str = Field(..., min_length=5)
    reporter_name: Optional[str] = None
    reporter_phone: Optional[str] = None

class TicketUpdate(BaseModel):
    category: Optional[FaultCategory] = None
    priority: Optional[TicketPriority] = None
    description: Optional[str] = None
    reporter_name: Optional[str] = None
    reporter_phone: Optional[str] = None
    assigned_technician_id: Optional[str] = None
    root_cause: Optional[str] = None
    resolution_summary: Optional[str] = None

class TicketStatusUpdate(BaseModel):
    new_status: TicketStatus
    comment: Optional[str] = None
    root_cause: Optional[str] = None
    resolution_summary: Optional[str] = None

class TicketAssignRequest(BaseModel):
    technician_id: str
    comment: Optional[str] = None

class TicketStatusHistoryResponse(BaseModel):
    id: str
    ticket_id: str
    previous_status: Optional[TicketStatus] = None
    new_status: TicketStatus
    changed_by: Optional[str] = None
    changed_by_user: Optional[UserResponse] = None
    comment: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class MaintenanceActionBase(BaseModel):
    action_type: str = Field(..., min_length=2, max_length=100)
    description: str = Field(..., min_length=5)
    parts_replaced: List[Dict[str, Any]] = Field(default_factory=list)
    duration_minutes: int = Field(0, ge=0)

class MaintenanceActionCreate(MaintenanceActionBase):
    technician_id: Optional[str] = None

class MaintenanceActionResponse(MaintenanceActionBase):
    id: str
    ticket_id: str
    technician_id: str
    technician: Optional[TechnicianResponse] = None
    created_at: datetime

    class Config:
        from_attributes = True

class TicketResponse(TicketBase):
    id: str
    ticket_number: str
    machine_id: str
    location_id: str
    source: TicketSource
    status: TicketStatus
    assigned_technician_id: Optional[str] = None
    is_recurring: bool = False
    recurring_occurrence_count: int = 1
    sla_due_at: Optional[datetime] = None
    acknowledged_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    root_cause: Optional[str] = None
    resolution_summary: Optional[str] = None
    total_parts_cost: float = 0.00
    machine: Optional[MachineResponse] = None
    location: Optional[LocationResponse] = None
    assigned_technician: Optional[TechnicianResponse] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class TicketDetailResponse(TicketResponse):
    status_history: List[TicketStatusHistoryResponse] = Field(default_factory=list)
    maintenance_actions: List[MaintenanceActionResponse] = Field(default_factory=list)
