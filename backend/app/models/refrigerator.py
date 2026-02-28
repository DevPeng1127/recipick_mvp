import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class MemberRole(str, enum.Enum):
    OWNER = "OWNER"
    GUEST = "GUEST"


class Refrigerator(Base):
    __tablename__ = "refrigerators"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    members: Mapped[list["RefrigeratorMember"]] = relationship(
        back_populates="refrigerator", cascade="all, delete-orphan"
    )
    storage_boxes: Mapped[list["StorageBox"]] = relationship(
        back_populates="refrigerator", cascade="all, delete-orphan"
    )


class RefrigeratorMember(Base):
    __tablename__ = "refrigerator_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    refrigerator_id: Mapped[int] = mapped_column(
        ForeignKey("refrigerators.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[MemberRole] = mapped_column(Enum(MemberRole), nullable=False)

    refrigerator: Mapped["Refrigerator"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="memberships")

    __table_args__ = (
        UniqueConstraint("refrigerator_id", "user_id", name="uq_fridge_user"),
        Index("ix_refrigerator_members_user_id", "user_id"),
    )


from app.models.storage import StorageBox  # noqa: E402
from app.models.user import User  # noqa: E402
