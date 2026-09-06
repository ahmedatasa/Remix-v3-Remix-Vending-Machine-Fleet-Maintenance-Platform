from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel
from backend.app.schemas.users import UserResponse

class AuditLogResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    old_values: Optional[Dict[str, Any]] = None
    new_values: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    user: Optional[UserResponse] = None
    created_at: datetime

    class Config:
        from_attributes = True
