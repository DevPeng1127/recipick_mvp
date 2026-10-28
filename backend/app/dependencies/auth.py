from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.models.refrigerator import MemberRole, RefrigeratorMember
from app.models.storage import StorageBox
from app.models.user import User
from app.utils.security import decode_token

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_token(credentials.credentials)
    if payload is None or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id = int(payload["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


async def require_refrigerator_member(
    refrigerator_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RefrigeratorMember:
    result = await db.execute(
        select(RefrigeratorMember).where(
            RefrigeratorMember.refrigerator_id == refrigerator_id,
            RefrigeratorMember.user_id == current_user.id,
        )
    )
    member = result.scalar_one_or_none()

    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this refrigerator",
        )
    return member


async def require_storage_box_member(
    storage_box_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StorageBox:
    result = await db.execute(
        select(StorageBox).where(StorageBox.id == storage_box_id)
    )
    storage_box = result.scalar_one_or_none()

    if storage_box is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Storage box not found",
        )

    member_result = await db.execute(
        select(RefrigeratorMember).where(
            RefrigeratorMember.refrigerator_id == storage_box.refrigerator_id,
            RefrigeratorMember.user_id == current_user.id,
        )
    )
    member = member_result.scalar_one_or_none()

    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this refrigerator",
        )
    return storage_box


async def require_refrigerator_owner(
    member: RefrigeratorMember = Depends(require_refrigerator_member),
) -> RefrigeratorMember:
    if member.role != MemberRole.OWNER:
        raise HTTPException(403, "소유자만 변경할 수 있습니다.")
    return member
