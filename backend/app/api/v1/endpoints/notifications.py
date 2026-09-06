import uuid
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from backend.app.core.dependencies import get_db, get_current_active_user
from backend.app.models.users import User
from backend.app.models.notifications import Notification
from backend.app.schemas.notifications import NotificationResponse
from backend.app.schemas.common import MessageResponse
from backend.app.core.exceptions import NotFoundError

router = APIRouter(prefix="/notifications", tags=["In-App Notifications"])

@router.get(
    "",
    response_model=List[NotificationResponse],
    summary="Get User Notifications"
)
async def get_my_notifications(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Notification).where(
        Notification.user_id == current_user.id
    ).order_by(Notification.created_at.desc()).limit(50)
    
    notifications = (await db.execute(stmt)).scalars().all()
    return [NotificationResponse.from_orm(n) for n in notifications]

@router.post(
    "/{notification_id}/read",
    response_model=MessageResponse,
    summary="Mark Notification as Read"
)
async def mark_read(
    notification_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    n_uid = uuid.UUID(notification_id)
    stmt = select(Notification).where(
        Notification.id == n_uid,
        Notification.user_id == current_user.id
    )
    notification = (await db.execute(stmt)).scalar_one_or_none()
    if not notification:
        raise NotFoundError("Notification", notification_id)

    notification.is_read = True
    notification.read_at = datetime.now(timezone.utc)
    db.add(notification)
    await db.commit()

    return MessageResponse(message="Notification marked as read")

@router.post(
    "/read-all",
    response_model=MessageResponse,
    summary="Mark All Notifications as Read"
)
async def mark_all_read(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = update(Notification).where(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).values(is_read=True, read_at=datetime.now(timezone.utc))
    
    await db.execute(stmt)
    await db.commit()

    return MessageResponse(message="All notifications marked as read")
