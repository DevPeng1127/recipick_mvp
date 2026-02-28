from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserPreference
from app.schemas.user import UserPreferenceUpdate


async def get_user_preference(user_id: int, db: AsyncSession) -> UserPreference | None:
    result = await db.execute(
        select(UserPreference).where(UserPreference.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def upsert_user_preference(
    user_id: int, data: UserPreferenceUpdate, db: AsyncSession
) -> UserPreference:
    result = await db.execute(
        select(UserPreference).where(UserPreference.user_id == user_id)
    )
    preference = result.scalar_one_or_none()

    if preference is None:
        preference = UserPreference(user_id=user_id)
        db.add(preference)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(preference, key, value)

    await db.flush()
    return preference
