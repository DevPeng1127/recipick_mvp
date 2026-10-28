import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class CookingPlan(Base):
    __tablename__ = "cooking_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(100))
    recipe: Mapped[str] = mapped_column(Text)
    servings: Mapped[int] = mapped_column(Integer)
    refrigerator_ids: Mapped[list] = mapped_column(JSONB)
    requirements: Mapped[list] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    request_hash: Mapped[str | None] = mapped_column(String(64))
    result: Mapped[dict | None] = mapped_column(JSONB)
