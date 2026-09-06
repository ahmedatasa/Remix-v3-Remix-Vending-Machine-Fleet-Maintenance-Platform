import uuid
from typing import AsyncGenerator, List, Optional
from fastapi import Depends, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.db.session import AsyncSessionLocal
from backend.app.core.config import settings
from backend.app.core.security import decode_token
from backend.app.core.exceptions import AuthenticationError, ForbiddenError
from backend.app.models.users import User
from backend.app.models.enums import UserRole

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency to yield an async database session per request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def get_token_from_header(authorization: Optional[str] = Header(None)) -> str:
    """Extracts bearer token from Authorization header."""
    if not authorization:
        raise AuthenticationError("Authorization header missing")
    
    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise AuthenticationError("Invalid authorization format. Expected 'Bearer <token>'")
    
    return parts[1]

async def get_current_user(
    token: str = Depends(get_token_from_header),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Decodes JWT, fetches user from DB, and verifies status."""
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise AuthenticationError("Invalid token type. Expected access token")
            
        user_id_str = payload.get("sub")
        if not user_id_str:
            raise AuthenticationError("Token payload missing subject identifier")
            
        user_id = uuid.UUID(user_id_str)
    except ValueError as e:
        raise AuthenticationError(f"Invalid or expired token: {str(e)}")
    except Exception:
        raise AuthenticationError("Could not validate credentials")

    stmt = select(User).where(User.id == user_id, User.is_deleted == False)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise AuthenticationError("User not found or deleted")
    if not user.is_active:
        raise AuthenticationError("User account is inactive")

    return user

async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Verifies that the authenticated user is active."""
    if not current_user.is_active:
        raise AuthenticationError("Inactive user account")
    return current_user

class RoleChecker:
    """RBAC dependency ensuring the authenticated user possesses one of the allowed roles."""
    def __init__(self, allowed_roles: List[UserRole]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: User = Depends(get_current_active_user)) -> User:
        # SUPER_ADMIN always has full access
        if user.role == UserRole.SUPER_ADMIN:
            return user
            
        if user.role not in self.allowed_roles:
            raise ForbiddenError(
                f"Role '{user.role.value}' does not have sufficient permissions. Required roles: {[r.value for r in self.allowed_roles]}"
            )
        return user

class PaginationParams:
    """Standardized query parameters for paginated endpoints."""
    def __init__(
        self,
        page: int = Query(1, ge=1, description="Page number (1-indexed)"),
        page_size: int = Query(settings.DEFAULT_PAGE_SIZE, ge=1, le=settings.MAX_PAGE_SIZE, description="Number of records per page"),
        search: Optional[str] = Query(None, description="General search keyword across searchable fields"),
        sort_by: Optional[str] = Query(None, description="Field to sort by"),
        sort_order: str = Query("asc", regex="^(asc|desc)$", description="Sort order ('asc' or 'desc')")
    ):
        self.page = page
        self.page_size = page_size
        self.search = search.strip() if search else None
        self.sort_by = sort_by
        self.sort_order = sort_order
        self.offset = (page - 1) * page_size
