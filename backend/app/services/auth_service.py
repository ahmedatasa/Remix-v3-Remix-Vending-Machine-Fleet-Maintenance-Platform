import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_token
from backend.app.core.config import settings
from backend.app.core.exceptions import AuthenticationError, NotFoundError, BusinessLogicError
from backend.app.models.users import User
from backend.app.models.technicians import Technician
from backend.app.schemas.auth import LoginRequest, TokenResponse, CurrentUserResponse
from backend.app.services.audit_service import log_audit_event

async def authenticate_user(db: AsyncSession, login_data: LoginRequest, ip_address: Optional[str] = None) -> TokenResponse:
    """Authenticates user credentials and issues token pair."""
    stmt = select(User).where(User.email == login_data.email.lower(), User.is_deleted == False)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(login_data.password, user.password_hash):
        raise AuthenticationError("Invalid email or password")
    
    if not user.is_active:
        raise AuthenticationError("Account is inactive. Please contact your administrator")

    # Update last login timestamp
    user.last_login_at = datetime.now(timezone.utc)
    db.add(user)
    
    # Check if user is linked to a technician profile
    tech_stmt = select(Technician).where(Technician.user_id == user.id, Technician.is_deleted == False)
    tech_res = await db.execute(tech_stmt)
    technician = tech_res.scalar_one_or_none()

    # Generate Tokens
    claims = {
        "email": user.email,
        "role": user.role.value,
        "name": user.full_name,
        "technician_id": str(technician.id) if technician else None
    }
    
    access_token = create_access_token(subject=str(user.id), claims=claims)
    refresh_token = create_refresh_token(subject=str(user.id))

    # Audit login
    await log_audit_event(
        db=db,
        action="AUTH_LOGIN",
        entity_type="users",
        entity_id=str(user.id),
        user_id=str(user.id),
        new_values={"email": user.email, "role": user.role.value},
        ip_address=ip_address
    )
    
    await db.commit()

    current_user = CurrentUserResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        role=user.role,
        is_active=user.is_active,
        technician_id=str(technician.id) if technician else None
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in_seconds=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=current_user
    )

async def refresh_access_token(db: AsyncSession, refresh_token: str) -> TokenResponse:
    """Validates refresh token and issues a fresh access & refresh token pair."""
    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise AuthenticationError("Invalid token type. Expected refresh token")
        user_id = uuid.UUID(payload.get("sub"))
    except Exception:
        raise AuthenticationError("Invalid or expired refresh token")

    stmt = select(User).where(User.id == user_id, User.is_deleted == False)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise AuthenticationError("User not found or inactive")

    tech_stmt = select(Technician).where(Technician.user_id == user.id, Technician.is_deleted == False)
    tech_res = await db.execute(tech_stmt)
    technician = tech_res.scalar_one_or_none()

    claims = {
        "email": user.email,
        "role": user.role.value,
        "name": user.full_name,
        "technician_id": str(technician.id) if technician else None
    }
    
    new_access_token = create_access_token(subject=str(user.id), claims=claims)
    new_refresh_token = create_refresh_token(subject=str(user.id))

    current_user = CurrentUserResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        role=user.role,
        is_active=user.is_active,
        technician_id=str(technician.id) if technician else None
    )

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        expires_in_seconds=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=current_user
    )

async def update_user_password(db: AsyncSession, user: User, current_pass: str, new_pass: str) -> None:
    """Updates password verifying current password first."""
    if not verify_password(current_pass, user.password_hash):
        raise BusinessLogicError("Current password is incorrect")
    
    user.password_hash = get_password_hash(new_pass)
    db.add(user)
    await log_audit_event(
        db=db,
        action="AUTH_PASSWORD_CHANGE",
        entity_type="users",
        entity_id=str(user.id),
        user_id=str(user.id)
    )
    await db.commit()
