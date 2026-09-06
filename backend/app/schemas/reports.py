from datetime import date, datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class MTTRReportItem(BaseModel):
    category: str
    total_tickets: int
    resolved_tickets: int
    total_downtime_minutes: int
    mttr_minutes: float
    sla_breaches: int

class MTTRReportResponse(BaseModel):
    overall_mttr_minutes: float
    categories: List[MTTRReportItem]
    generated_at: datetime

class ChronicFailureItem(BaseModel):
    machine_id: str
    machine_number: str
    building_name: str
    floor_name: str
    failure_count: int
    most_frequent_category: str
    total_downtime_hours: float
    health_score: int

class RepeatFailureReportResponse(BaseModel):
    total_chronic_machines: int
    threshold_failures_in_30_days: int
    items: List[ChronicFailureItem]

class InventoryValuationReportItem(BaseModel):
    category_name: str
    total_skus: int
    total_quantity: int
    total_valuation: float
    low_stock_items: int

class InventoryValuationReportResponse(BaseModel):
    total_inventory_valuation: float
    total_skus: int
    categories: List[InventoryValuationReportItem]

class MachineLifecycleReportItem(BaseModel):
    machine_id: str
    machine_number: str
    model_name: str
    building_name: str
    installation_date: Optional[date]
    total_tickets_lifetime: int
    total_maintenance_cost: float
    status: str

class MachineLifecycleReportResponse(BaseModel):
    total_machines: int
    items: List[MachineLifecycleReportItem]
