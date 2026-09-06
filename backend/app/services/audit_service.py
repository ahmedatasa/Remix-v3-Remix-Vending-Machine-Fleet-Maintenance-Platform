import uuid
from typing import Any, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.audit import AuditLog
from backend.app.core.logging import logger

async def log_audit_event(
    db: AsyncSession,
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    user_id: Optional[str] = None,
    old_values: Optional[Dict[str, Any]] = None,
    new_values: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
) -> None:
    """Safely log an audit event to the database."""
    try:
        audit_entry = AuditLog(
            user_id=uuid.UUID(user_id) if user_id else None,
            action=action,
            entity_type=entity_type,
            entity_id=uuid.UUID(entity_id) if entity_id else None,
            old_values=old_values,
            new_values=new_values,
            ip_address=ip_address,
            user_agent=user_agent
        )
        db.add(audit_entry)
        # Flush without full commit so it belongs to caller transaction
        await db.flush()
    except Exception as e:
        logger.error(f"Failed to record audit log: {str(e)}")
