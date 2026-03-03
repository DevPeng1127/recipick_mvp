from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ingredient import Ingredient
from app.models.storage import StorageBox
from app.schemas.ingredient import IngredientCreate, IngredientUpdate


async def list_ingredients_by_storage_box(
    storage_box_id: int, db: AsyncSession
) -> list[Ingredient]:
    result = await db.execute(
        select(Ingredient).where(Ingredient.storage_box_id == storage_box_id)
    )
    return list(result.scalars().all())


async def list_ingredients_by_refrigerator(
    refrigerator_id: int, db: AsyncSession
) -> list[Ingredient]:
    result = await db.execute(
        select(Ingredient)
        .join(StorageBox)
        .where(StorageBox.refrigerator_id == refrigerator_id)
        .order_by(Ingredient.expiry_date.asc().nulls_last())
    )
    return list(result.scalars().all())


async def create_ingredient(
    storage_box_id: int, data: IngredientCreate, db: AsyncSession
) -> Ingredient:
    ingredient = Ingredient(
        storage_box_id=storage_box_id,
        name=data.name,
        quantity=data.quantity,
        unit=data.unit,
        expiry_date=data.expiry_date,
    )
    db.add(ingredient)
    await db.flush()
    return ingredient


async def update_ingredient(
    ingredient_id: int, storage_box_id: int, data: IngredientUpdate, db: AsyncSession
) -> Ingredient | None:
    result = await db.execute(
        select(Ingredient).where(
            Ingredient.id == ingredient_id,
            Ingredient.storage_box_id == storage_box_id,
        )
    )
    ingredient = result.scalar_one_or_none()
    if ingredient is None:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(ingredient, key, value)

    await db.flush()
    return ingredient


async def delete_ingredient(
    ingredient_id: int, storage_box_id: int, db: AsyncSession
) -> bool:
    result = await db.execute(
        select(Ingredient).where(
            Ingredient.id == ingredient_id,
            Ingredient.storage_box_id == storage_box_id,
        )
    )
    ingredient = result.scalar_one_or_none()
    if ingredient is None:
        return False

    await db.delete(ingredient)
    await db.flush()
    return True
