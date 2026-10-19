import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class RecipeUsageAttempt(Base):
    __tablename__ = "recipe_usage_attempts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # Keep project usage even if an account is deleted; this is not a cascade FK.
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    lease_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
