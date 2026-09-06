from datetime import date, datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from backend.app.models.enums import MachineStatus, DataQualityStatus
from backend.app.schemas.buildings import LocationResponse, LocationDetailResponse

# Machine Models
class MachineModelBase(BaseModel):
    model_name: str = Field(..., min_length=2, max_length=100)
    manufacturer: str = Field(..., min_length=2, max_length=100)
    category: str = "SNACK_AND_BEVERAGE"
    specifications: Dict[str, Any] = Field(default_factory=dict)

class MachineModelCreate(MachineModelBase):
    pass

class MachineModelResponse(MachineModelBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# QR Code
class QRCodeResponse(BaseModel):
    id: str
    machine_id: str
    public_url: str
    qr_svg: Optional[str] = None
    scan_count: int = 0
    last_scanned_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Machines
class MachineBase(BaseModel):
    machine_number: str = Field(..., min_length=2, max_length=100)
    serial_number: Optional[str] = None
    model_id: Optional[str] = None
    machine_type: str = "STANDARD_VENDING"
    status: MachineStatus = MachineStatus.OPERATIONAL
    data_quality_status: DataQualityStatus = DataQualityStatus.VALID
    quality_notes: Optional[str] = None
    health_score: int = Field(100, ge=0, le=100)
    installation_date: Optional[date] = None
    next_maintenance_due: Optional[date] = None
    notes: Optional[str] = None

class MachineCreate(MachineBase):
    location_id: Optional[str] = None

class MachineUpdate(BaseModel):
    machine_number: Optional[str] = None
    serial_number: Optional[str] = None
    model_id: Optional[str] = None
    machine_type: Optional[str] = None
    status: Optional[MachineStatus] = None
    data_quality_status: Optional[DataQualityStatus] = None
    quality_notes: Optional[str] = None
    health_score: Optional[int] = Field(None, ge=0, le=100)
    installation_date: Optional[date] = None
    next_maintenance_due: Optional[date] = None
    notes: Optional[str] = None

class MachineStatusUpdate(BaseModel):
    status: MachineStatus
    notes: Optional[str] = None

class RelocateMachineRequest(BaseModel):
    location_id: str
    reason: Optional[str] = None

class MachineResponse(MachineBase):
    id: str
    public_id: str
    qr_code_url: Optional[str] = None
    last_maintenance_at: Optional[datetime] = None
    current_location: Optional[LocationResponse] = None
    model: Optional[MachineModelResponse] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class MachineDetailResponse(MachineResponse):
    current_location: Optional[LocationDetailResponse] = None
    qr_code: Optional[QRCodeResponse] = None
    open_tickets_count: int = 0
    total_failures_count: int = 0
    lifetime_downtime_minutes: int = 0
