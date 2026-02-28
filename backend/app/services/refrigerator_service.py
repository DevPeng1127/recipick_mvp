from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.refrigerator import MemberRole, Refrigerator, RefrigeratorMember
from app.schemas.refrigerator import RefrigeratorCreate, RefrigeratorUpdate


async def list_refrigerators(user_id: int, db: AsyncSession) -> list[Refrigerator]:
    result = await db.execute(
        select(Refrigerator)
        .join(RefrigeratorMember)
        .where(RefrigeratorMember.user_id == user_id)
    )
    return list(result.scalars().all())


async def create_refrigerator(
    user_id: int, data: RefrigeratorCreate, db: AsyncSession
) -> Refrigerator:
    refrigerator = Refrigerator(name=data.name)
    db.add(refrigerator)
    await db.flush()

    member = RefrigeratorMember(
        refrigerator_id=refrigerator.id,
        user_id=user_id,
        role=MemberRole.OWNER,
    )
    db.add(member)
    await db.flush()

    return refrigerator


async def get_refrigerator_detail(
    refrigerator_id: int, db: AsyncSession
) -> Refrigerator | None:
    result = await db.execute(
        select(Refrigerator)
        .options(
            selectinload(Refrigerator.members),
            selectinload(Refrigerator.storage_boxes),
        )
        .where(Refrigerator.id == refrigerator_id)
    )
    return result.scalar_one_or_none()


async def update_refrigerator(
    refrigerator_id: int, data: RefrigeratorUpdate, db: AsyncSession
) -> Refrigerator | None:
    result = await db.execute(
        select(Refrigerator).where(Refrigerator.id == refrigerator_id)
    )
    refrigerator = result.scalar_one_or_none()
    if refrigerator is None:
        return None

    refrigerator.name = data.name
    await db.flush()
    return refrigerator


async def delete_refrigerator(
    refrigerator_id: int, user_id: int, db: AsyncSession
) -> bool:
    result = await db.execute(
        select(RefrigeratorMember).where(
            RefrigeratorMember.refrigerator_id == refrigerator_id,
            RefrigeratorMember.user_id == user_id,
            RefrigeratorMember.role == MemberRole.OWNER,
        )
    )
    if result.scalar_one_or_none() is None:
        return False

    result = await db.execute(
        select(Refrigerator).where(Refrigerator.id == refrigerator_id)
    )
    refrigerator = result.scalar_one_or_none()
    if refrigerator is None:
        return False

    await db.delete(refrigerator)
    await db.flush()
    return True
