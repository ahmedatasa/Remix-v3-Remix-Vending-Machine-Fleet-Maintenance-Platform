import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Text, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin

class QRCode(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "qr_codes"

    machine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("machines.id", ondelete="CASCADE"), 
        unique=True,
        nullable=False
    )
    public_url: Mapped[str] = mapped_column(String(500), nullable=False)
    qr_svg: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scan_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_scanned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    machine: Mapped["Machine"] = relationship("Machine", back_populates="qr_code")
