import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy import String, Integer, Text, Numeric, Boolean, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin
from backend.app.models.enums import TicketSource, TicketStatus, TicketPriority, FaultCategory

class Ticket(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "tickets"

    ticket_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    machine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("machines.id", ondelete="RESTRICT"), 
        nullable=False,
        index=True
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("locations.id", ondelete="RESTRICT"), 
        nullable=False,
        index=True
    )
    source: Mapped[TicketSource] = mapped_column(
        SQLEnum(TicketSource, name="ticket_source_enum"), 
        default=TicketSource.CUSTOMER_QR, 
        nullable=False
    )
    category: Mapped[FaultCategory] = mapped_column(
        SQLEnum(FaultCategory, name="fault_category_enum"), 
        default=FaultCategory.OTHER, 
        nullable=False,
        index=True
    )
    priority: Mapped[TicketPriority] = mapped_column(
        SQLEnum(TicketPriority, name="ticket_priority_enum"), 
        default=TicketPriority.MEDIUM, 
        nullable=False,
        index=True
    )
    status: Mapped[TicketStatus] = mapped_column(
        SQLEnum(TicketStatus, name="ticket_status_enum"), 
        default=TicketStatus.NEW, 
        nullable=False,
        index=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    reporter_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    reporter_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    assigned_technician_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("technicians.id", ondelete="SET NULL"), 
        nullable=True,
        index=True
    )
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    recurring_occurrence_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    sla_due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    root_cause: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolution_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    total_parts_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00, nullable=False)

    # Relationships
    machine: Mapped["Machine"] = relationship("Machine", back_populates="tickets")
    location: Mapped["Location"] = relationship("Location", back_populates="tickets")
    assigned_technician: Mapped[Optional["Technician"]] = relationship("Technician", back_populates="assigned_tickets")
    status_history: Mapped[List["TicketStatusHistory"]] = relationship("TicketStatusHistory", back_populates="ticket", cascade="all, delete-orphan")
    attachments: Mapped[List["TicketAttachment"]] = relationship("TicketAttachment", back_populates="ticket", cascade="all, delete-orphan")
    maintenance_actions: Mapped[List["MaintenanceAction"]] = relationship("MaintenanceAction", back_populates="ticket", cascade="all, delete-orphan")
    spare_part_requests: Mapped[List["SparePartRequest"]] = relationship("SparePartRequest", back_populates="ticket", cascade="all, delete-orphan")

class TicketStatusHistory(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "ticket_status_history"

    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("tickets.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    previous_status: Mapped[Optional[TicketStatus]] = mapped_column(
        SQLEnum(TicketStatus, name="ticket_status_enum"), 
        nullable=True
    )
    new_status: Mapped[TicketStatus] = mapped_column(
        SQLEnum(TicketStatus, name="ticket_status_enum"), 
        nullable=False
    )
    changed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("users.id", ondelete="SET NULL"), 
        nullable=True
    )
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="status_history")

class TicketAttachment(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "ticket_attachments"

    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("tickets.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    file_url: Mapped[str] = mapped_column(String(500), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("users.id", ondelete="SET NULL"), 
        nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="attachments")

class MaintenanceAction(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "maintenance_actions"

    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("tickets.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    technician_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("technicians.id", ondelete="RESTRICT"), 
        nullable=False,
        index=True
    )
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    parts_replaced: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="maintenance_actions")
    technician: Mapped["Technician"] = relationship("Technician", back_populates="maintenance_actions")
