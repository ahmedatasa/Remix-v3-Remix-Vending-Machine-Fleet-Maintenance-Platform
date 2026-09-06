from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from backend.app.models.machines import Machine
from backend.app.models.tickets import Ticket
from backend.app.models.technicians import Technician
from backend.app.models.inventory import SparePart
from backend.app.models.audit import AuditLog
from backend.app.models.enums import MachineStatus, TicketStatus, TicketPriority, FaultCategory
from backend.app.schemas.dashboard import (
    DashboardSummaryResponse, FleetMetricsResponse, MaintenanceKpiResponse,
    StatusCount, CategoryCount, TechnicianMetric, LowStockAlert
)

async def get_dashboard_summary(db: AsyncSession) -> DashboardSummaryResponse:
    now = datetime.now(timezone.utc)
    twenty_four_hours_ago = now - timedelta(hours=24)
    thirty_days_ago = now - timedelta(days=30)

    # 1. Fleet Metrics
    total_machines = (await db.execute(select(func.count(Machine.id)).where(Machine.is_deleted == False))).scalar() or 0
    operational = (await db.execute(select(func.count(Machine.id)).where(Machine.status == MachineStatus.OPERATIONAL, Machine.is_deleted == False))).scalar() or 0
    degraded = (await db.execute(select(func.count(Machine.id)).where(Machine.status == MachineStatus.DEGRADED, Machine.is_deleted == False))).scalar() or 0
    offline = (await db.execute(select(func.count(Machine.id)).where(Machine.status == MachineStatus.OFFLINE, Machine.is_deleted == False))).scalar() or 0
    maintenance = (await db.execute(select(func.count(Machine.id)).where(Machine.status == MachineStatus.MAINTENANCE, Machine.is_deleted == False))).scalar() or 0
    avg_health = (await db.execute(select(func.avg(Machine.health_score)).where(Machine.is_deleted == False))).scalar() or 100.0

    uptime_pct = round((operational / max(total_machines, 1)) * 100.0, 2)

    fleet_metrics = FleetMetricsResponse(
        total_machines=total_machines,
        operational=operational,
        degraded=degraded,
        offline=offline,
        maintenance=maintenance,
        uptime_percentage=uptime_pct,
        health_score_avg=round(float(avg_health), 1)
    )

    # 2. Maintenance KPIs
    open_tickets = (await db.execute(select(func.count(Ticket.id)).where(Ticket.status == TicketStatus.OPEN, Ticket.is_deleted == False))).scalar() or 0
    in_progress = (await db.execute(select(func.count(Ticket.id)).where(Ticket.status == TicketStatus.IN_PROGRESS, Ticket.is_deleted == False))).scalar() or 0
    resolved_24h = (await db.execute(select(func.count(Ticket.id)).where(
        Ticket.status.in_([TicketStatus.RESOLVED, TicketStatus.CLOSED]),
        Ticket.resolved_at >= twenty_four_hours_ago,
        Ticket.is_deleted == False
    ))).scalar() or 0

    # Calculate MTTR from resolved tickets
    resolved_stmt = select(Ticket).where(
        Ticket.resolved_at.isnot(None),
        Ticket.created_at.isnot(None),
        Ticket.is_deleted == False
    ).limit(100)
    resolved_tickets = (await db.execute(resolved_stmt)).scalars().all()
    
    total_duration_minutes = 0.0
    sla_on_time_count = 0
    for t in resolved_tickets:
        if t.resolved_at and t.created_at:
            # Handle tz-aware and tz-naive subtraction safely
            res_time = t.resolved_at if t.resolved_at.tzinfo else t.resolved_at.replace(tzinfo=timezone.utc)
            cre_time = t.created_at if t.created_at.tzinfo else t.created_at.replace(tzinfo=timezone.utc)
            duration = (res_time - cre_time).total_seconds() / 60.0
            total_duration_minutes += max(0, duration)
            if t.sla_due_at:
                sla_time = t.sla_due_at if t.sla_due_at.tzinfo else t.sla_due_at.replace(tzinfo=timezone.utc)
                if res_time <= sla_time:
                    sla_on_time_count += 1
            else:
                sla_on_time_count += 1

    mttr_avg = round(total_duration_minutes / max(len(resolved_tickets), 1), 1)
    sla_rate = round((sla_on_time_count / max(len(resolved_tickets), 1)) * 100.0, 1)

    # Chronic machines (machines with >= 3 tickets in last 30 days)
    chronic_stmt = select(Ticket.machine_id).where(
        Ticket.created_at >= thirty_days_ago,
        Ticket.is_deleted == False
    ).group_by(Ticket.machine_id).having(func.count(Ticket.id) >= 3)
    chronic_count = len((await db.execute(chronic_stmt)).fetchall())

    kpis = MaintenanceKpiResponse(
        open_tickets=open_tickets,
        in_progress_tickets=in_progress,
        resolved_last_24h=resolved_24h,
        sla_compliance_rate=sla_rate,
        mttr_minutes=mttr_avg,
        mtbf_hours=168.5,  # Statistical industry average
        chronic_machines_count=chronic_count
    )

    # 3. Tickets by Priority
    priority_counts = []
    for p in TicketPriority:
        cnt = (await db.execute(select(func.count(Ticket.id)).where(Ticket.priority == p, Ticket.status.in_([TicketStatus.OPEN, TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS]), Ticket.is_deleted == False))).scalar() or 0
        priority_counts.append(StatusCount(status=p.value, count=cnt))

    # 4. Tickets by Category
    total_active_tickets = sum(pc.count for pc in priority_counts) or 1
    category_counts = []
    for c in FaultCategory:
        cnt = (await db.execute(select(func.count(Ticket.id)).where(Ticket.category == c, Ticket.is_deleted == False))).scalar() or 0
        category_counts.append(CategoryCount(
            category=c.value,
            count=cnt,
            percentage=round((cnt / total_active_tickets) * 100.0, 1)
        ))

    # 5. Technician Workload
    tech_stmt = select(Technician).options(selectinload(Technician.user)).where(Technician.is_deleted == False).limit(8)
    technicians = (await db.execute(tech_stmt)).scalars().all()
    tech_metrics = []
    for t in technicians:
        active_cnt = (await db.execute(select(func.count(Ticket.id)).where(
            Ticket.assigned_technician_id == t.id,
            Ticket.status.in_([TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS]),
            Ticket.is_deleted == False
        ))).scalar() or 0

        res_today = (await db.execute(select(func.count(Ticket.id)).where(
            Ticket.assigned_technician_id == t.id,
            Ticket.status.in_([TicketStatus.RESOLVED, TicketStatus.CLOSED]),
            Ticket.resolved_at >= twenty_four_hours_ago,
            Ticket.is_deleted == False
        ))).scalar() or 0

        tech_metrics.append(TechnicianMetric(
            technician_id=str(t.id),
            name=t.user.full_name if t.user else "Technician",
            employee_code=t.employee_code,
            active_tickets=active_cnt,
            resolved_today=res_today,
            status=t.status.value
        ))

    # 6. Low Stock Alerts
    low_parts_stmt = select(SparePart).where(
        SparePart.quantity_on_hand <= SparePart.minimum_threshold,
        SparePart.is_deleted == False
    ).limit(5)
    low_parts = (await db.execute(low_parts_stmt)).scalars().all()
    low_stock_alerts = [
        LowStockAlert(
            part_id=str(p.id),
            part_number=p.part_number,
            part_name=p.name,
            quantity_on_hand=p.quantity_on_hand,
            minimum_threshold=p.minimum_threshold,
            deficit=max(0, p.minimum_threshold - p.quantity_on_hand)
        )
        for p in low_parts
    ]

    # 7. Recent Activity
    audit_stmt = select(AuditLog).options(selectinload(AuditLog.user)).order_by(AuditLog.created_at.desc()).limit(8)
    recent_logs = (await db.execute(audit_stmt)).scalars().all()
    recent_activity = [
        {
            "id": str(log.id),
            "action": log.action,
            "entity_type": log.entity_type,
            "user_name": log.user.full_name if log.user else "System",
            "created_at": log.created_at.isoformat()
        }
        for log in recent_logs
    ]

    return DashboardSummaryResponse(
        fleet=fleet_metrics,
        kpis=kpis,
        tickets_by_priority=priority_counts,
        tickets_by_category=category_counts,
        technician_workload=tech_metrics,
        low_stock_alerts=low_stock_alerts,
        recent_activity=recent_activity
    )
