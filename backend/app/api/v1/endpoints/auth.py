from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.core.dependencies import get_db, get_current_active_user
from backend.app.schemas.auth import LoginRequest, TokenResponse, RefreshTokenRequest, ChangePasswordRequest, CurrentUserResponse
from backend.app.schemas.common import MessageResponse
from backend.app.services.auth_service import authenticate_user, refresh_access_token, update_user_password
from backend.app.models.users import User

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="User Login",
    description="Authenticate user with email and password, returning JWT access and refresh tokens."
)
async def login(
    request: Request,
    login_data: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    ip = request.client.host if request.client else None
    return await authenticate_user(db, login_data, ip_address=ip)

@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh Access Token",
    description="Issue a new access token and refresh token pair using a valid refresh token."
)
async def refresh_token(
    refresh_data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    return await refresh_access_token(db, refresh_data.refresh_token)

@router.get(
    "/me",
    response_model=CurrentUserResponse,
    summary="Get Current Authenticated User",
    description="Retrieve details of currently logged-in user."
)
async def get_current_user_profile(
    current_user: User = Depends(get_current_active_user)
):
    return CurrentUserResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        phone=current_user.phone,
        role=current_user.role,
        is_active=current_user.is_active
    )

@router.post(
    "/change-password",
    response_model=MessageResponse,
    summary="Change Password",
    description="Update the current user's password."
)
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    await update_user_password(db, current_user, data.current_password, data.new_password)
    return MessageResponse(message="Password successfully changed")
