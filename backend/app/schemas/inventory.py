from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from backend.app.models.enums import InventoryTransactionType, PartRequestStatus
from backend.app.schemas.technicians import TechnicianResponse
from backend.app.schemas.users import UserResponse

# Suppliers
class SupplierBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    lead_time_days: int = Field(7, ge=0)
    rating: float = Field(5.0, ge=1.0, le=5.0)

class SupplierCreate(SupplierBase):
    pass

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    lead_time_days: Optional[int] = Field(None, ge=0)
    rating: Optional[float] = Field(None, ge=1.0, le=5.0)

class SupplierResponse(SupplierBase):
    id: str
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Spare Part Categories
class SparePartCategoryBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    code: str = Field(..., min_length=2, max_length=50)
    description: Optional[str] = None

class SparePartCategoryCreate(SparePartCategoryBase):
    pass

class SparePartCategoryResponse(SparePartCategoryBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True

# Spare Parts
class SparePartBase(BaseModel):
    part_number: str = Field(..., min_length=2, max_length=100)
    name: str = Field(..., min_length=2, max_length=255)
    category_id: Optional[str] = None
    compatible_models: List[str] = Field(default_factory=list)
    unit_cost: float = Field(0.00, ge=0)
    quantity_on_hand: int = Field(0, ge=0)
    minimum_threshold: int = Field(5, ge=0)
    reorder_quantity: int = Field(10, ge=1)
    primary_supplier_id: Optional[str] = None
    storage_location: Optional[str] = "Main Warehouse"

class SparePartCreate(SparePartBase):
    pass

class SparePartUpdate(BaseModel):
    part_number: Optional[str] = None
    name: Optional[str] = None
    category_id: Optional[str] = None
    compatible_models: Optional[List[str]] = None
    unit_cost: Optional[float] = Field(None, ge=0)
    quantity_on_hand: Optional[int] = Field(None, ge=0)
    minimum_threshold: Optional[int] = Field(None, ge=0)
    reorder_quantity: Optional[int] = Field(None, ge=1)
    primary_supplier_id: Optional[str] = None
    storage_location: Optional[str] = None

class SparePartResponse(SparePartBase):
    id: str
    is_low_stock: bool = False
    category: Optional[SparePartCategoryResponse] = None
    primary_supplier: Optional[SupplierResponse] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Inventory Transactions
class InventoryTransactionCreate(BaseModel):
    part_id: str
    transaction_type: InventoryTransactionType
    quantity: int = Field(..., description="Positive or negative quantity change")
    unit_cost: Optional[float] = None
    ticket_id: Optional[str] = None
    machine_id: Optional[str] = None
    reference_number: Optional[str] = None
    notes: Optional[str] = None

class InventoryTransactionResponse(BaseModel):
    id: str
    part_id: str
    transaction_type: InventoryTransactionType
    quantity: int
    balance_after: int
    unit_cost: Optional[float] = None
    ticket_id: Optional[str] = None
    machine_id: Optional[str] = None
    reference_number: Optional[str] = None
    performed_by: Optional[str] = None
    notes: Optional[str] = None
    part: Optional[SparePartResponse] = None
    user: Optional[UserResponse] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Spare Part Requests
class SparePartRequestCreate(BaseModel):
    ticket_id: str
    part_id: str
    quantity_requested: int = Field(1, ge=1)
    notes: Optional[str] = None

class SparePartRequestStatusUpdate(BaseModel):
    status: PartRequestStatus
    notes: Optional[str] = None

class SparePartRequestResponse(BaseModel):
    id: str
    ticket_id: str
    part_id: str
    technician_id: str
    quantity_requested: int
    quantity_approved: int
    status: PartRequestStatus
    approved_by: Optional[str] = None
    notes: Optional[str] = None
    part: Optional[SparePartResponse] = None
    technician: Optional[TechnicianResponse] = None
    approver: Optional[UserResponse] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
