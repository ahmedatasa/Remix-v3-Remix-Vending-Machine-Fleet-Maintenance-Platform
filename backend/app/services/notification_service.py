import uuid
from typing import Any, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.notifications import Notification
from backend.app.core.logging import logger

async def create_notification(
    db: AsyncSession,
    user_id: str,
    title: str,
    message: str,
    notification_type: str = "SYSTEM_ALERT",
    reference_id: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None
) -> Optional[Notification]:
    """Create a persistent notification for a user."""
    try:
        notification = Notification(
            user_id=uuid.UUID(user_id),
            title=title,
            message=message,
            notification_type=notification_type,
            reference_id=uuid.UUID(reference_id) if reference_id else None,
            data=data or {}
        )
        db.add(notification)
        await db.flush()
        return notification
    except Exception as e:
        logger.error(f"Failed to create notification for user {user_id}: {str(e)}")
        return None
