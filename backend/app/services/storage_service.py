from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.storage import StorageBox
from app.schemas.storage import StorageBoxCreate, StorageBoxUpdate


async def list_storage_boxes(
    refrigerator_id: int, db: AsyncSession
) -> list[StorageBox]:
    result = await db.execute(
        select(StorageBox).where(StorageBox.refrigerator_id == refrigerator_id)
    )
    return list(result.scalars().all())


async def create_storage_box(
    refrigerator_id: int, data: StorageBoxCreate, db: AsyncSession
) -> StorageBox:
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
    result = await db.execute(
        select(StorageBox).where(
            StorageBox.id == storage_box_id,
            StorageBox.refrigerator_id == refrigerator_id,
        )
    )
    storage_box = result.scalar_one_or_none()
    if storage_box is None:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(storage_box, key, value)

    await db.flush()
    return storage_box


async def delete_storage_box(
    storage_box_id: int, refrigerator_id: int, db: AsyncSession
) -> bool:
    result = await db.execute(
        select(StorageBox).where(
            StorageBox.id == storage_box_id,
            StorageBox.refrigerator_id == refrigerator_id,
        )
    )
    storage_box = result.scalar_one_or_none()
    if storage_box is None:
        return False

    await db.delete(storage_box)
    await db.flush()
    return True
