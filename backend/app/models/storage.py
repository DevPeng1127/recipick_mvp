import enum

from sqlalchemy import Enum, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class StorageType(str, enum.Enum):
    ROOM = "ROOM"
    FRIDGE = "FRIDGE"
    FREEZER = "FREEZER"


class StorageBox(Base):
    __tablename__ = "storage_boxes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    refrigerator_id: Mapped[int] = mapped_column(
        ForeignKey("refrigerators.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[StorageType] = mapped_column(Enum(StorageType), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0)

    refrigerator: Mapped["Refrigerator"] = relationship(back_populates="storage_boxes")
    ingredients: Mapped[list["Ingredient"]] = relationship(
        back_populates="storage_box", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_storage_boxes_refrigerator_id", "refrigerator_id"),
    )


from app.models.ingredient import Ingredient  # noqa: E402
from app.models.refrigerator import Refrigerator  # noqa: E402
