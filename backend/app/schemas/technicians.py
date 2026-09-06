from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from backend.app.models.enums import TechnicianStatus
from backend.app.schemas.users import UserResponse

class TechnicianBase(BaseModel):
    employee_code: str = Field(..., min_length=2, max_length=50)
    specialization: Optional[str] = None
    status: TechnicianStatus = TechnicianStatus.AVAILABLE
    skills: List[str] = Field(default_factory=list)
    assigned_region: Optional[str] = None
    max_active_tickets: int = Field(5, ge=1, le=20)

class TechnicianCreate(TechnicianBase):
    user_id: str

class TechnicianUpdate(BaseModel):
    specialization: Optional[str] = None
    status: Optional[TechnicianStatus] = None
    skills: Optional[List[str]] = None
    assigned_region: Optional[str] = None
    max_active_tickets: Optional[int] = Field(None, ge=1, le=20)

class TechnicianStatusUpdate(BaseModel):
    status: TechnicianStatus

class TechnicianResponse(TechnicianBase):
    id: str
    user_id: str
    user: Optional[UserResponse] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class TechnicianDetailResponse(TechnicianResponse):
    active_tickets_count: int = 0
    resolved_tickets_count: int = 0
    avg_resolution_time_minutes: float = 0.0
