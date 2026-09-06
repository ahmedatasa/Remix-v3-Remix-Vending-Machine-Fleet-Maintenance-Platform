import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, Integer, Text, Numeric, Boolean, DateTime, ForeignKey, Enum as SQLEnum, ARRAY
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin
from backend.app.models.enums import InventoryTransactionType, PartRequestStatus, TicketPriority

class SparePartCategory(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "spare_part_categories"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name_ar: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    spare_parts: Mapped[List["SparePart"]] = relationship("SparePart", back_populates="category")

class SparePart(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "spare_parts"

    part_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    name_ar: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    category_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("spare_part_categories.id", ondelete="SET NULL"), 
        nullable=True
    )
    supplier_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("suppliers.id", ondelete="SET NULL"), 
        nullable=True
    )
    manufacturer: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    compatible_models: Mapped[List[str]] = mapped_column(ARRAY(String), default=list)
    unit: Mapped[str] = mapped_column(String(50), default="PIECE", nullable=False)
    current_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    min_stock_level: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    max_stock_level: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    unit_cost: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    storage_location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    category: Mapped[Optional["SparePartCategory"]] = relationship("SparePartCategory", back_populates="spare_parts")
    supplier: Mapped[Optional["Supplier"]] = relationship("Supplier", back_populates="spare_parts")
    transactions: Mapped[List["InventoryTransaction"]] = relationship("InventoryTransaction", back_populates="part")
    requests: Mapped[List["SparePartRequest"]] = relationship("SparePartRequest", back_populates="part")

class InventoryTransaction(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "inventory_transactions"

    part_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("spare_parts.id", ondelete="RESTRICT"), 
        nullable=False,
        index=True
    )
    transaction_type: Mapped[InventoryTransactionType] = mapped_column(
        SQLEnum(InventoryTransactionType, name="inventory_transaction_enum"), 
        nullable=False
    )
    quantity_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    reference_ticket_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("tickets.id", ondelete="SET NULL"), 
        nullable=True
    )
    performed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("users.id", ondelete="SET NULL"), 
        nullable=True
    )
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    part: Mapped["SparePart"] = relationship("SparePart", back_populates="transactions")

class SparePartRequest(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "spare_part_requests"

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
    part_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("spare_parts.id", ondelete="RESTRICT"), 
        nullable=False,
        index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    priority: Mapped[TicketPriority] = mapped_column(
        SQLEnum(TicketPriority, name="ticket_priority_enum"), 
        default=TicketPriority.MEDIUM
    )
    status: Mapped[PartRequestStatus] = mapped_column(
        SQLEnum(PartRequestStatus, name="part_request_status_enum"), 
        default=PartRequestStatus.REQUESTED,
        nullable=False
    )
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("users.id", ondelete="SET NULL"), 
        nullable=True
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)

    # Relationships
    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="spare_part_requests")
    technician: Mapped["Technician"] = relationship("Technician", back_populates="spare_part_requests")
    part: Mapped["SparePart"] = relationship("SparePart", back_populates="requests")
