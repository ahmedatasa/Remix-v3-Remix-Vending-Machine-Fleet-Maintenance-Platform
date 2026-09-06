from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field
from backend.app.models.enums import UserRole

class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=255)
    phone: Optional[str] = None
    role: UserRole = UserRole.VIEWER
    is_active: bool = True

class UserCreate(UserBase):
    password: str = Field(..., min_length=6)

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None

class UserRoleUpdate(BaseModel):
    role: UserRole

class UserResponse(UserBase):
    id: str
    last_login_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class PermissionResponse(BaseModel):
    id: str
    code: str
    description: Optional[str] = None
    module: str

    class Config:
        from_attributes = True
