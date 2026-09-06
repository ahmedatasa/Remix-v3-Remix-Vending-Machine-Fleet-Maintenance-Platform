import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy import String, Integer, BigInteger, Text, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin
from backend.app.models.enums import DataQualityStatus

class Import(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "imports"

    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    file_hash_sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    imported_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("users.id", ondelete="SET NULL"), 
        nullable=True
    )
    total_columns_detected: Mapped[int] = mapped_column(Integer, nullable=False)
    total_records_created: Mapped[int] = mapped_column(Integer, nullable=False)
    review_required_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    invalid_records_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    summary_report: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)

    # Relationships
    import_rows: Mapped[List["ImportRow"]] = relationship("ImportRow", back_populates="import_batch", cascade="all, delete-orphan")

class ImportRow(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "import_rows"

    import_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("imports.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    source_sheet: Mapped[str] = mapped_column(String(100), nullable=False)
    source_column: Mapped[str] = mapped_column(String(20), nullable=False)
    source_row: Mapped[int] = mapped_column(Integer, nullable=False)
    original_machine_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    original_serial_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    original_building: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    original_location: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    normalized_machine_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("machines.id", ondelete="SET NULL"), 
        nullable=True
    )
    normalized_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("locations.id", ondelete="SET NULL"), 
        nullable=True
    )
    data_quality_status: Mapped[DataQualityStatus] = mapped_column(
        SQLEnum(DataQualityStatus, name="data_quality_enum"), 
        nullable=False
    )
    detected_issues: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relationships
    import_batch: Mapped["Import"] = relationship("Import", back_populates="import_rows")
