from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from backend.app.models.enums import UserRole

class LoginRequest(BaseModel):
    email: EmailStr = Field(..., example="admin@vendingfleet.com")
    password: str = Field(..., min_length=4, example="Admin@123")

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in_seconds: int
    user: "CurrentUserResponse"

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)

class CurrentUserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    phone: Optional[str] = None
    role: UserRole
    is_active: bool
    technician_id: Optional[str] = None

TokenResponse.update_forward_refs()
