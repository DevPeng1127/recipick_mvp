from datetime import date

from sqlalchemy import Date, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Ingredient(Base):
    __tablename__ = "ingredients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    storage_box_id: Mapped[int] = mapped_column(
        ForeignKey("storage_boxes.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    storage_box: Mapped["StorageBox"] = relationship(back_populates="ingredients")

    __table_args__ = (
        Index("ix_ingredients_storage_box_id", "storage_box_id"),
        Index("ix_ingredients_expiry_date", "expiry_date"),
        Index("ix_ingredients_name", "name"),
    )


from app.models.storage import StorageBox  # noqa: E402
