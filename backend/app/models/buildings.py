import uuid
from typing import List, Optional
from sqlalchemy import String, Integer, Text, Boolean, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin

class Building(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "buildings"

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    name_ar: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    code: Mapped[Optional[str]] = mapped_column(String(50), unique=True, nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    floors: Mapped[List["Floor"]] = relationship("Floor", back_populates="building", cascade="all, delete-orphan")
    locations: Mapped[List["Location"]] = relationship("Location", back_populates="building", cascade="all, delete-orphan")

class Floor(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "floors"

    building_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("buildings.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    floor_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    floor_name: Mapped[str] = mapped_column(String(100), nullable=False)
    floor_name_ar: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    level_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relationships
    building: Mapped["Building"] = relationship("Building", back_populates="floors")
    locations: Mapped[List["Location"]] = relationship("Location", back_populates="floor")

class Location(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "locations"

    building_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("buildings.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    floor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("floors.id", ondelete="SET NULL"), 
        nullable=True,
        index=True
    )
    area_zone: Mapped[str] = mapped_column(String(255), nullable=False)
    area_zone_ar: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    full_description: Mapped[str] = mapped_column(Text, nullable=False)
    original_raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    building: Mapped["Building"] = relationship("Building", back_populates="locations")
    floor: Mapped[Optional["Floor"]] = relationship("Floor", back_populates="locations")
    machine_locations: Mapped[List["MachineLocation"]] = relationship("MachineLocation", back_populates="location")
    tickets: Mapped[List["Ticket"]] = relationship("Ticket", back_populates="location")

class MachineLocation(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "machine_locations"

    machine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("machines.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("locations.id", ondelete="RESTRICT"), 
        nullable=False,
        index=True
    )
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    unassigned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    machine: Mapped["Machine"] = relationship("Machine", back_populates="location_history")
    location: Mapped["Location"] = relationship("Location", back_populates="machine_locations")
