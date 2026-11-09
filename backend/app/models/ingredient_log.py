import enum
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Enum, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class ActionType(str, enum.Enum):
    CONSUMED = "CONSUMED"
    DISPOSED = "DISPOSED"


class IngredientLog(Base):
    __tablename__ = "ingredient_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    refrigerator_id: Mapped[int | None] = mapped_column(
        ForeignKey("refrigerators.id", ondelete="SET NULL"), nullable=True
    )
    refrigerator_name: Mapped[str] = mapped_column(String(100), nullable=False)
    ingredient_id: Mapped[int] = mapped_column(Integer, nullable=False)
    action_type: Mapped[ActionType] = mapped_column(Enum(ActionType), nullable=False)
    ingredient_name: Mapped[str] = mapped_column(String(100), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_source: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown", server_default="unknown")
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Existing timestamp columns store UTC without timezone metadata.
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )

    __table_args__ = (
        Index("ix_ingredient_logs_user_id", "user_id"),
        Index("ix_ingredient_logs_action_type", "action_type"),
        Index("ix_ingredient_logs_created_at", "created_at"),
    )
