"""Inventory writers lock refrigerators, then boxes, then ingredients.

The caller holds the refrigerator locks before calling these helpers. Acquire
each level in ID order and hold it until the enclosing transaction completes.
"""
from collections.abc import Collection

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingredient import Ingredient
from app.models.storage import StorageBox


async def lock_storage_boxes(
    refrigerator_ids: list[int], db: AsyncSession, *,
    storage_box_ids: Collection[int] | None = None,
    ingredient_ids: Collection[int] | None = None,
    read: bool = False,
) -> list[StorageBox]:
    query = select(StorageBox).where(StorageBox.refrigerator_id.in_(refrigerator_ids))
    if storage_box_ids is not None:
        query = query.where(StorageBox.id.in_(storage_box_ids))
    if ingredient_ids is not None:
        query = query.where(StorageBox.id.in_(
            select(Ingredient.storage_box_id).where(Ingredient.id.in_(ingredient_ids))
        ))
    return list((await db.scalars(
        query.order_by(StorageBox.id).with_for_update(read=read)
        .execution_options(populate_existing=True)
    )).all())


async def lock_box_ingredients(storage_box_ids: list[int], db: AsyncSession) -> None:
    # Cascade deletion must acquire all child locks before ORM emits DELETEs.
    await db.execute(select(Ingredient.id).where(
        Ingredient.storage_box_id.in_(storage_box_ids)
    ).order_by(Ingredient.id).with_for_update())
