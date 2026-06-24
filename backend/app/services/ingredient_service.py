from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingredient import Ingredient
from app.models.ingredient_log import ActionType, IngredientLog
from app.models.refrigerator import Refrigerator, RefrigeratorMember
from app.models.storage import StorageBox
from app.schemas.ingredient import ConsumeDisposeRequest, IngredientCreate, IngredientSearchResult, IngredientUpdate


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



async def consume_or_dispose_ingredient(
    ingredient_id: int,
    storage_box_id: int,
    user_id: int,
    refrigerator_name: str,
    refrigerator_id: int,
    action_type: ActionType,
    data: ConsumeDisposeRequest,
    db: AsyncSession,
) -> Ingredient | None:
    result = await db.execute(
        select(Ingredient)
        .where(
            Ingredient.id == ingredient_id,
            Ingredient.storage_box_id == storage_box_id,
        )
        .with_for_update()
    )
    ingredient = result.scalar_one_or_none()
    if ingredient is None:
        raise LookupError("Ingredient not found")

    quantity = data.quantity
    if quantity is not None and quantity <= 0:
        raise ValueError("Quantity must be positive")

    # 전량 처리: quantity가 None이거나 현재 수량 이상
    full = quantity is None or quantity >= ingredient.quantity

    log_quantity = ingredient.quantity if full else round(quantity, 4)

    log = IngredientLog(
        user_id=user_id,
        refrigerator_id=refrigerator_id,
        refrigerator_name=refrigerator_name,
        ingredient_id=ingredient_id,
        action_type=action_type,
        ingredient_name=ingredient.name,
        quantity=log_quantity,
        unit=ingredient.unit,
        expiry_date=ingredient.expiry_date,
        memo=data.memo,
    )
    db.add(log)

    if full:
        await db.delete(ingredient)
        await db.flush()
        return None
    else:
        ingredient.quantity = round(ingredient.quantity - quantity, 4)
        await db.flush()
        return ingredient


async def search_ingredients(
    user_id: int, query: str, db: AsyncSession
) -> list[IngredientSearchResult]:
    result = await db.execute(
        select(
            Ingredient.id,
            Ingredient.name,
            Ingredient.quantity,
            Ingredient.unit,
            Ingredient.expiry_date,
            StorageBox.name.label("box_name"),
            StorageBox.type.label("box_type"),
            Refrigerator.name.label("fridge_name"),
            Refrigerator.id.label("fridge_id"),
        )
        .join(StorageBox, Ingredient.storage_box_id == StorageBox.id)
        .join(Refrigerator, StorageBox.refrigerator_id == Refrigerator.id)
        .join(RefrigeratorMember, RefrigeratorMember.refrigerator_id == Refrigerator.id)
        .where(
            RefrigeratorMember.user_id == user_id,
            Ingredient.name.ilike(f"%{query}%"),
        )
        .order_by(Ingredient.name)
    )
    rows = result.all()
    return [
        IngredientSearchResult(
            ingredient_id=row.id,
            ingredient_name=row.name,
            quantity=row.quantity,
            unit=row.unit,
            expiry_date=row.expiry_date,
            storage_box_name=row.box_name,
            storage_box_type=row.box_type,
            refrigerator_name=row.fridge_name,
            refrigerator_id=row.fridge_id,
        )
        for row in rows
    ]
