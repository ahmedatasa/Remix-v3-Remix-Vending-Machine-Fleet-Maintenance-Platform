from datetime import datetime, timezone, timedelta
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from backend.app.models.tickets import Ticket
from backend.app.models.machines import Machine, MachineModel
from backend.app.models.buildings import Location, Building, MachineLocation
from backend.app.models.inventory import SparePart, SparePartCategory
from backend.app.models.enums import FaultCategory
from backend.app.schemas.reports import (
    MTTRReportResponse, MTTRReportItem,
    RepeatFailureReportResponse, ChronicFailureItem,
    InventoryValuationReportResponse, InventoryValuationReportItem,
    MachineLifecycleReportResponse, MachineLifecycleReportItem
)

async def generate_mttr_report(db: AsyncSession) -> MTTRReportResponse:
    now = datetime.now(timezone.utc)
    items: List[MTTRReportItem] = []
    total_downtime = 0
    total_resolved = 0

    for cat in FaultCategory:
        stmt = select(Ticket).where(
            Ticket.category == cat,
            Ticket.resolved_at.isnot(None),
            Ticket.created_at.isnot(None),
            Ticket.is_deleted == False
        )
        resolved = (await db.execute(stmt)).scalars().all()
        
        all_stmt = select(func.count(Ticket.id)).where(Ticket.category == cat, Ticket.is_deleted == False)
        total_tickets = (await db.execute(all_stmt)).scalar() or 0

        cat_downtime = 0.0
        sla_breaches = 0
        for t in resolved:
            res_time = t.resolved_at if t.resolved_at.tzinfo else t.resolved_at.replace(tzinfo=timezone.utc)
            cre_time = t.created_at if t.created_at.tzinfo else t.created_at.replace(tzinfo=timezone.utc)
            duration = (res_time - cre_time).total_seconds() / 60.0
            cat_downtime += max(0, duration)
            if t.sla_due_at:
                sla_time = t.sla_due_at if t.sla_due_at.tzinfo else t.sla_due_at.replace(tzinfo=timezone.utc)
                if res_time > sla_time:
                    sla_breaches += 1

        mttr = round(cat_downtime / max(len(resolved), 1), 1)
        total_downtime += int(cat_downtime)
        total_resolved += len(resolved)

        items.append(MTTRReportItem(
            category=cat.value,
            total_tickets=total_tickets,
            resolved_tickets=len(resolved),
            total_downtime_minutes=int(cat_downtime),
            mttr_minutes=mttr,
            sla_breaches=sla_breaches
        ))

    overall_mttr = round(total_downtime / max(total_resolved, 1), 1)
    return MTTRReportResponse(
        overall_mttr_minutes=overall_mttr,
        categories=items,
        generated_at=now
    )

async def generate_repeat_failures_report(db: AsyncSession) -> RepeatFailureReportResponse:
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    
    # Query machines with >= 2 tickets in 30 days
    stmt = select(
        Ticket.machine_id,
        func.count(Ticket.id).label("fail_count")
    ).where(
        Ticket.created_at >= thirty_days_ago,
        Ticket.is_deleted == False
    ).group_by(Ticket.machine_id).having(func.count(Ticket.id) >= 2).order_by(func.count(Ticket.id).desc())

    records = (await db.execute(stmt)).fetchall()
    items: List[ChronicFailureItem] = []

    for rec in records:
        machine_id, count = rec[0], rec[1]
        machine = (await db.execute(select(Machine).options(
            selectinload(Machine.location_associations).selectinload(MachineLocation.location).selectinload(Location.building),
            selectinload(Machine.location_associations).selectinload(MachineLocation.location).selectinload(Location.floor)
        ).where(Machine.id == machine_id))).scalar_one_or_none()
        
        if machine:
            building_name = "N/A"
            floor_name = "N/A"
            if machine.current_location:
                building_name = machine.current_location.building.name if machine.current_location.building else "N/A"
                floor_name = machine.current_location.floor.floor_name if machine.current_location.floor else "N/A"

            # Most frequent category
            cat_stmt = select(Ticket.category, func.count(Ticket.id)).where(
                Ticket.machine_id == machine_id
            ).group_by(Ticket.category).order_by(func.count(Ticket.id).desc()).limit(1)
            top_cat = (await db.execute(cat_stmt)).fetchone()
            top_cat_str = top_cat[0].value if top_cat else "OTHER"

            items.append(ChronicFailureItem(
                machine_id=str(machine.id),
                machine_number=machine.machine_number,
                building_name=building_name,
                floor_name=floor_name,
                failure_count=count,
                most_frequent_category=top_cat_str,
                total_downtime_hours=round(count * 3.5, 1),
                health_score=machine.health_score
            ))

    return RepeatFailureReportResponse(
        total_chronic_machines=len(items),
        threshold_failures_in_30_days=2,
        items=items
    )

async def generate_inventory_valuation_report(db: AsyncSession) -> InventoryValuationReportResponse:
    categories = (await db.execute(select(SparePartCategory).order_by(SparePartCategory.name.asc()))).scalars().all()
    items: List[InventoryValuationReportItem] = []
    grand_total_valuation = 0.0
    total_skus = 0

    for cat in categories:
        parts_stmt = select(SparePart).where(SparePart.category_id == cat.id, SparePart.is_deleted == False)
        parts = (await db.execute(parts_stmt)).scalars().all()

        cat_valuation = sum(p.quantity_on_hand * p.unit_cost for p in parts)
        cat_qty = sum(p.quantity_on_hand for p in parts)
        low_count = sum(1 for p in parts if p.quantity_on_hand <= p.minimum_threshold)

        grand_total_valuation += cat_valuation
        total_skus += len(parts)

        items.append(InventoryValuationReportItem(
            category_name=cat.name,
            total_skus=len(parts),
            total_quantity=cat_qty,
            total_valuation=round(cat_valuation, 2),
            low_stock_items=low_count
        ))

    return InventoryValuationReportResponse(
        total_inventory_valuation=round(grand_total_valuation, 2),
        total_skus=total_skus,
        categories=items
    )

async def generate_machine_lifecycle_report(db: AsyncSession) -> MachineLifecycleReportResponse:
    stmt = select(Machine).options(
        selectinload(Machine.model),
        selectinload(Machine.location_associations).selectinload(MachineLocation.location).selectinload(Location.building)
    ).where(Machine.is_deleted == False).order_by(Machine.machine_number.asc()).limit(100)

    machines = (await db.execute(stmt)).scalars().all()
    items: List[MachineLifecycleReportItem] = []

    for m in machines:
        ticket_count_stmt = select(func.count(Ticket.id)).where(Ticket.machine_id == m.id, Ticket.is_deleted == False)
        ticket_count = (await db.execute(ticket_count_stmt)).scalar() or 0

        cost_stmt = select(func.sum(Ticket.total_parts_cost)).where(Ticket.machine_id == m.id)
        cost = (await db.execute(cost_stmt)).scalar() or 0.0

        b_name = m.current_location.building.name if (m.current_location and m.current_location.building) else "N/A"

        items.append(MachineLifecycleReportItem(
            machine_id=str(m.id),
            machine_number=m.machine_number,
            model_name=m.model.model_name if m.model else "Generic Model",
            building_name=b_name,
            installation_date=m.installation_date,
            total_tickets_lifetime=ticket_count,
            total_maintenance_cost=round(float(cost), 2),
            status=m.status.value
        ))

    return MachineLifecycleReportResponse(
        total_machines=len(items),
        items=items
    )
