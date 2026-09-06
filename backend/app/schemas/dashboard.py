from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from backend.app.models.enums import MachineStatus, TicketPriority, FaultCategory

class StatusCount(BaseModel):
    status: str
    count: int

class CategoryCount(BaseModel):
    category: str
    count: int
    percentage: float

class TechnicianMetric(BaseModel):
    technician_id: str
    name: str
    employee_code: str
    active_tickets: int
    resolved_today: int
    status: str

class LowStockAlert(BaseModel):
    part_id: str
    part_number: str
    part_name: str
    quantity_on_hand: int
    minimum_threshold: int
    deficit: int

class FleetMetricsResponse(BaseModel):
    total_machines: int
    operational: int
    degraded: int
    offline: int
    maintenance: int
    uptime_percentage: float
    health_score_avg: float

class MaintenanceKpiResponse(BaseModel):
    open_tickets: int
    in_progress_tickets: int
    resolved_last_24h: int
    sla_compliance_rate: float
    mttr_minutes: float
    mtbf_hours: float
    chronic_machines_count: int

class DashboardSummaryResponse(BaseModel):
    fleet: FleetMetricsResponse
    kpis: MaintenanceKpiResponse
    tickets_by_priority: List[StatusCount]
    tickets_by_category: List[CategoryCount]
    technician_workload: List[TechnicianMetric]
    low_stock_alerts: List[LowStockAlert]
    recent_activity: List[Dict[str, Any]]
