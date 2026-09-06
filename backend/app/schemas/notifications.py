from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field

class NotificationCreate(BaseModel):
    user_id: str
    title: str = Field(..., min_length=2, max_length=255)
    message: str
    notification_type: str = "TICKET_ASSIGNED"
    reference_id: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

class NotificationResponse(BaseModel):
    id: str
    user_id: str
    title: str
    message: str
    notification_type: str
    reference_id: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
