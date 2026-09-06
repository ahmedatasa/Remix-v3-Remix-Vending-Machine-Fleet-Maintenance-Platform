import uuid
from datetime import date, datetime
from typing import List, Optional, Dict, Any
from sqlalchemy import String, Integer, Text, Date, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin
from backend.app.models.enums import MachineStatus, DataQualityStatus, FaultCategory

class MachineModel(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "machine_models"

    model_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    manufacturer: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="SNACK_AND_BEVERAGE")
    specifications: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)

    # Relationships
    machines: Mapped[List["Machine"]] = relationship("Machine", back_populates="model")

class Machine(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "machines"

    public_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        unique=True, 
        nullable=False, 
        default=uuid.uuid4,
        index=True
    )
    machine_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    serial_number: Mapped[Optional[str]] = mapped_column(String(150), nullable=True, index=True)
    model_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("machine_models.id", ondelete="SET NULL"), 
        nullable=True
    )
    machine_type: Mapped[str] = mapped_column(String(100), default="STANDARD_VENDING")
    status: Mapped[MachineStatus] = mapped_column(
        SQLEnum(MachineStatus, name="machine_status_enum"), 
        default=MachineStatus.OPERATIONAL, 
        nullable=False,
        index=True
    )
    data_quality_status: Mapped[DataQualityStatus] = mapped_column(
        SQLEnum(DataQualityStatus, name="data_quality_enum"), 
        default=DataQualityStatus.VALID, 
        nullable=False,
        index=True
    )
    quality_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    health_score: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    installation_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    last_maintenance_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    next_maintenance_due: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    qr_code_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    model: Mapped[Optional["MachineModel"]] = relationship("MachineModel", back_populates="machines")
    location_history: Mapped[List["MachineLocation"]] = relationship("MachineLocation", back_populates="machine", cascade="all, delete-orphan")
    qr_code: Mapped[Optional["QRCode"]] = relationship("QRCode", back_populates="machine", uselist=False, cascade="all, delete-orphan")
    tickets: Mapped[List["Ticket"]] = relationship("Ticket", back_populates="machine")
    failure_events: Mapped[List["MachineFailureEvent"]] = relationship("MachineFailureEvent", back_populates="machine", cascade="all, delete-orphan")

class MachineFailureEvent(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "machine_failure_events"

    machine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("machines.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    ticket_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("tickets.id", ondelete="SET NULL"), 
        nullable=True
    )
    category: Mapped[FaultCategory] = mapped_column(
        SQLEnum(FaultCategory, name="fault_category_enum"), 
        nullable=False
    )
    downtime_minutes: Mapped[int] = mapped_column(Integer, default=0)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    machine: Mapped["Machine"] = relationship("Machine", back_populates="failure_events")
