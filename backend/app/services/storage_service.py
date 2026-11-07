from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.storage import StorageBox
from app.schemas.storage import StorageBoxCreate, StorageBoxUpdate
from app.services.inventory_locks import lock_box_ingredients, lock_storage_boxes
from app.services.sharing_service import lock_refrigerator


async def list_storage_boxes(
    refrigerator_id: int, db: AsyncSession
) -> list[StorageBox]:
    result = await db.execute(
        select(StorageBox)
        .where(StorageBox.refrigerator_id == refrigerator_id)
        .order_by(StorageBox.display_order.asc(), StorageBox.id.asc())
    )
    return list(result.scalars().all())


async def create_storage_box(
    refrigerator_id: int, data: StorageBoxCreate, db: AsyncSession
) -> StorageBox:
    await lock_refrigerator(refrigerator_id, db, read=True)
    storage_box = StorageBox(
        refrigerator_id=refrigerator_id,
        name=data.name,
        type=data.type,
    )
    db.add(storage_box)
    await db.flush()
    return storage_box


async def update_storage_box(
    storage_box_id: int, refrigerator_id: int, data: StorageBoxUpdate, db: AsyncSession
) -> StorageBox | None:
    await lock_refrigerator(refrigerator_id, db, read=True)
    boxes = await lock_storage_boxes([refrigerator_id], db, storage_box_ids=[storage_box_id])
    if not boxes:
        return None
    storage_box = boxes[0]

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(storage_box, key, value)

    await db.flush()
    return storage_box


async def delete_storage_box(
    storage_box_id: int, refrigerator_id: int, db: AsyncSession
) -> bool:
    await lock_refrigerator(refrigerator_id, db, read=True)
    boxes = await lock_storage_boxes([refrigerator_id], db, storage_box_ids=[storage_box_id])
    if not boxes:
        return False
    await lock_box_ingredients([storage_box_id], db)
    await db.delete(boxes[0])
    await db.flush()
    return True


async def reorder_storage_boxes(
    refrigerator_id: int, ordered_ids: list[int], db: AsyncSession
) -> None:
    await lock_refrigerator(refrigerator_id, db, read=True)
    await lock_storage_boxes([refrigerator_id], db, storage_box_ids=ordered_ids)
    # The requested display order is independent of lock acquisition order.
    for idx, box_id in enumerate(ordered_ids):
        await db.execute(
            update(StorageBox)
            .where(
                StorageBox.id == box_id,
                StorageBox.refrigerator_id == refrigerator_id,
            )
            .values(display_order=idx)
        )
    await db.flush()
