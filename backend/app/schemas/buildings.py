from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field

# Buildings
class BuildingBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    name_ar: Optional[str] = None
    code: Optional[str] = None
    address: Optional[str] = None

class BuildingCreate(BuildingBase):
    pass

class BuildingUpdate(BaseModel):
    name: Optional[str] = None
    name_ar: Optional[str] = None
    code: Optional[str] = None
    address: Optional[str] = None

class BuildingResponse(BuildingBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Floors
class FloorBase(BaseModel):
    building_id: str
    floor_number: Optional[int] = 0
    floor_name: str = Field(..., min_length=1, max_length=100)
    floor_name_ar: Optional[str] = None
    level_order: int = 0

class FloorCreate(FloorBase):
    pass

class FloorUpdate(BaseModel):
    floor_number: Optional[int] = None
    floor_name: Optional[str] = None
    floor_name_ar: Optional[str] = None
    level_order: Optional[int] = None

class FloorResponse(FloorBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Locations
class LocationBase(BaseModel):
    building_id: str
    floor_id: Optional[str] = None
    area_zone: str = Field(..., min_length=1, max_length=255)
    area_zone_ar: Optional[str] = None
    full_description: str
    original_raw_text: Optional[str] = None
    is_active: bool = True

class LocationCreate(LocationBase):
    pass

class LocationUpdate(BaseModel):
    building_id: Optional[str] = None
    floor_id: Optional[str] = None
    area_zone: Optional[str] = None
    area_zone_ar: Optional[str] = None
    full_description: Optional[str] = None
    original_raw_text: Optional[str] = None
    is_active: Optional[bool] = None

class LocationResponse(LocationBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class LocationDetailResponse(LocationResponse):
    building: Optional[BuildingResponse] = None
    floor: Optional[FloorResponse] = None
    active_machines_count: int = 0
