from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.refrigerator import MemberRole, Refrigerator, RefrigeratorMember
from app.models.storage import StorageBox
from app.schemas.refrigerator import RefrigeratorCreate, RefrigeratorUpdate


async def list_refrigerators(
    user_id: int, db: AsyncSession
) -> list[tuple[Refrigerator, bool, int]]:
    result = await db.execute(
        select(Refrigerator, RefrigeratorMember.is_favorite, RefrigeratorMember.display_order)
        .join(RefrigeratorMember)
        .where(RefrigeratorMember.user_id == user_id)
        .options(
            selectinload(Refrigerator.storage_boxes)
            .selectinload(StorageBox.ingredients)
        )
        .order_by(
            RefrigeratorMember.is_favorite.desc(),
            RefrigeratorMember.display_order.asc(),
            Refrigerator.id.asc(),
        )
    )
    return list(result.unique().all())


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


async def toggle_favorite(
    user_id: int, refrigerator_id: int, db: AsyncSession
) -> bool | None:
    result = await db.execute(
        select(RefrigeratorMember).where(
            RefrigeratorMember.user_id == user_id,
            RefrigeratorMember.refrigerator_id == refrigerator_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        return None

    member.is_favorite = not member.is_favorite
    await db.flush()
    return member.is_favorite


async def reorder_refrigerators(
    user_id: int, ordered_ids: list[int], db: AsyncSession
) -> None:
    for idx, rid in enumerate(ordered_ids):
        await db.execute(
            update(RefrigeratorMember)
            .where(
                RefrigeratorMember.user_id == user_id,
                RefrigeratorMember.refrigerator_id == rid,
            )
            .values(display_order=idx)
        )
    await db.flush()
