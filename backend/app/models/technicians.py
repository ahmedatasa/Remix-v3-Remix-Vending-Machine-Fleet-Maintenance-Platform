import uuid
from typing import List, Optional
from sqlalchemy import String, Integer, ForeignKey, Enum as SQLEnum, ARRAY, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin
from backend.app.models.enums import TechnicianStatus

class Technician(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "technicians"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("users.id", ondelete="CASCADE"), 
        unique=True, 
        nullable=False
    )
    employee_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    specialization: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[TechnicianStatus] = mapped_column(
        SQLEnum(TechnicianStatus, name="technician_status_enum"), 
        default=TechnicianStatus.AVAILABLE, 
        nullable=False,
        index=True
    )
    skills: Mapped[List[str]] = mapped_column(ARRAY(String), default=list)
    assigned_region: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    max_active_tickets: Mapped[int] = mapped_column(Integer, default=5, nullable=False)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="technician_profile")
    assigned_tickets: Mapped[List["Ticket"]] = relationship("Ticket", back_populates="assigned_technician")
    maintenance_actions: Mapped[List["MaintenanceAction"]] = relationship("MaintenanceAction", back_populates="technician")
    spare_part_requests: Mapped[List["SparePartRequest"]] = relationship("SparePartRequest", back_populates="technician")
