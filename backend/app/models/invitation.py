from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class RefrigeratorInvitation(Base):
    __tablename__ = "refrigerator_invitations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    refrigerator_id: Mapped[int] = mapped_column(
        ForeignKey("refrigerators.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Only a digest is stored; the bearer secret is returned once at creation.
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
