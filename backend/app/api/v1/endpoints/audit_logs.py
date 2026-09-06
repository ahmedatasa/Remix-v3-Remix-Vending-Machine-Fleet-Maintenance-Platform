import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from backend.app.core.dependencies import get_db, RoleChecker, PaginationParams
from backend.app.models.enums import UserRole
from backend.app.models.audit import AuditLog
from backend.app.schemas.audit import AuditLogResponse
from backend.app.schemas.common import PaginatedResponse, PaginatedMeta

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])

admin_only = RoleChecker([UserRole.SUPER_ADMIN])

@router.get(
    "",
    response_model=PaginatedResponse[AuditLogResponse],
    summary="List System Audit Logs",
    dependencies=[Depends(admin_only)]
)
async def get_audit_logs(
    params: PaginationParams = Depends(),
    entity_type: Optional[str] = Query(None, description="Filter by entity type (e.g. machines, tickets)"),
    action: Optional[str] = Query(None, description="Filter by action keyword"),
    db: AsyncSession = Depends(get_db)
):
    query = select(AuditLog).options(selectinload(AuditLog.user))
    count_query = select(func.count(AuditLog.id))

    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
        count_query = count_query.where(AuditLog.entity_type == entity_type)
    if action:
        query = query.where(AuditLog.action.ilike(f"%{action}%"))
        count_query = count_query.where(AuditLog.action.ilike(f"%{action}%"))

    query = query.order_by(AuditLog.created_at.desc()).offset(params.offset).limit(params.page_size)

    total = (await db.execute(count_query)).scalar() or 0
    items = (await db.execute(query)).scalars().all()
    total_pages = (total + params.page_size - 1) // params.page_size if total > 0 else 0

    return PaginatedResponse(
        items=[AuditLogResponse.from_orm(log) for log in items],
        meta=PaginatedMeta(
            page=params.page,
            page_size=params.page_size,
            total_records=total,
            total_pages=total_pages,
            has_next=params.page < total_pages,
            has_previous=params.page > 1
        )
    )
