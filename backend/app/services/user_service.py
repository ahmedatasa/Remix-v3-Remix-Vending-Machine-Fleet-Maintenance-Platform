import uuid
from typing import List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from backend.app.models.users import User, RolePermission, Permission
from backend.app.models.enums import UserRole
from backend.app.schemas.users import UserCreate, UserUpdate
from backend.app.core.security import get_password_hash
from backend.app.core.exceptions import ConflictError, NotFoundError
from backend.app.services.audit_service import log_audit_event

async def list_users(
    db: AsyncSession,
    offset: int = 0,
    limit: int = 20,
    search: Optional[str] = None,
    role: Optional[UserRole] = None
) -> Tuple[List[User], int]:
    """List users with pagination, role filtering, and search."""
    query = select(User).where(User.is_deleted == False)
    count_query = select(func.count(User.id)).where(User.is_deleted == False)

    if role:
        query = query.where(User.role == role)
        count_query = count_query.where(User.role == role)

    if search:
        search_filter = or_(
            User.full_name.ilike(f"%{search}%"),
            User.email.ilike(f"%{search}%"),
            User.phone.ilike(f"%{search}%")
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    query = query.order_by(User.created_at.desc()).offset(offset).limit(limit)

    total_records = (await db.execute(count_query)).scalar() or 0
    items = (await db.execute(query)).scalars().all()

    return list(items), total_records

async def get_user_by_id(db: AsyncSession, user_id: str) -> User:
    """Get single user by UUID."""
    uid = uuid.UUID(user_id)
    stmt = select(User).where(User.id == uid, User.is_deleted == False)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        raise NotFoundError("User", user_id)
    return user

async def create_user(db: AsyncSession, user_in: UserCreate, creator_id: Optional[str] = None) -> User:
    """Create a new user account."""
    # Check if email exists
    existing = await db.execute(select(User).where(User.email == user_in.email.lower()))
    if existing.scalar_one_or_none():
        raise ConflictError(f"User with email '{user_in.email}' already exists")

    new_user = User(
        email=user_in.email.lower(),
        password_hash=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        phone=user_in.phone,
        role=user_in.role,
        is_active=user_in.is_active
    )
    db.add(new_user)
    await db.flush()

    await log_audit_event(
        db=db,
        action="USER_CREATE",
        entity_type="users",
        entity_id=str(new_user.id),
        user_id=creator_id,
        new_values={"email": new_user.email, "role": new_user.role.value}
    )
    await db.commit()
    return new_user

async def update_user(db: AsyncSession, user_id: str, user_in: UserUpdate, updater_id: Optional[str] = None) -> User:
    """Update user fields."""
    user = await get_user_by_id(db, user_id)
    old_data = {"full_name": user.full_name, "role": user.role.value, "is_active": user.is_active}

    if user_in.full_name is not None:
        user.full_name = user_in.full_name
    if user_in.phone is not None:
        user.phone = user_in.phone
    if user_in.role is not None:
        user.role = user_in.role
    if user_in.is_active is not None:
        user.is_active = user_in.is_active
    if user_in.password:
        user.password_hash = get_password_hash(user_in.password)

    db.add(user)
    await log_audit_event(
        db=db,
        action="USER_UPDATE",
        entity_type="users",
        entity_id=str(user.id),
        user_id=updater_id,
        old_values=old_data,
        new_values={"full_name": user.full_name, "role": user.role.value, "is_active": user.is_active}
    )
    await db.commit()
    return user

async def soft_delete_user(db: AsyncSession, user_id: str, deleter_id: Optional[str] = None) -> None:
    """Soft delete user."""
    user = await get_user_by_id(db, user_id)
    user.soft_delete(deleter_id)
    db.add(user)
    await log_audit_event(
        db=db,
        action="USER_DELETE",
        entity_type="users",
        entity_id=str(user.id),
        user_id=deleter_id
    )
    await db.commit()

async def list_permissions(db: AsyncSession) -> List[Permission]:
    """List all available permissions."""
    stmt = select(Permission).order_by(Permission.module, Permission.code)
    return list((await db.execute(stmt)).scalars().all())
