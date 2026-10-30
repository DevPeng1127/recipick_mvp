from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.ai.recipe_graph import run_recipe_graph
from app.ai.prompts import today_kst
from app.models.refrigerator import RefrigeratorMember
from app.services.ingredient_service import list_ingredients_by_refrigerator
from app.schemas.recipe import MenuIngredient, MenuInventory, RecipeResponse
from app.services.cooking_service import authorize, create_plan, stock_rows
from app.services.user_service import get_user_preference


async def recommend_recipe(
    refrigerator_ids: list[int], user_id: int, db: AsyncSession, servings: int = 1,
    priority_ingredient_ids: list[int] | None = None,
) -> RecipeResponse:
    memberships = await db.execute(
        select(RefrigeratorMember.refrigerator_id).where(
            RefrigeratorMember.user_id == user_id,
            RefrigeratorMember.refrigerator_id.in_(refrigerator_ids),
        )
    )
    # Authorize the entire selection before reading ingredients or calling AI.
    if set(memberships.scalars().all()) != set(refrigerator_ids):
        raise PermissionError("Not a member of one or more requested refrigerators")

    all_ingredients = []
    for rid in sorted(set(refrigerator_ids)):
        ingredients = await list_ingredients_by_refrigerator(rid, db)
        all_ingredients.extend(ingredients)

    priorities = priority_ingredient_ids or []
    if not set(priorities).issubset({item.id for item in all_ingredients}):
        raise HTTPException(409, "선택한 재료가 변경되었거나 선택한 냉장고에 없습니다. 재료 목록을 새로고침해 주세요.")
    if any(item.id in priorities and item.expiry_date and item.expiry_date < today_kst() for item in all_ingredients):
        raise HTTPException(409, "기한이 지난 선택 재료가 있습니다. 제품 표시와 상태를 확인하고 재료 목록을 새로고침해 주세요.")
    preference = await get_user_preference(user_id, db)

    if not all_ingredients:
        return RecipeResponse(recipe="선택한 냉장고에 식재료가 없습니다. 식재료를 먼저 등록해주세요.")

    # Release the read transaction before the limiter opens its own transaction.
    # Otherwise concurrent requests can exhaust the connection pool while waiting.
    await db.commit()
    options = {"priority_ingredient_ids": priorities} if priorities else {}
    result = await run_recipe_graph(all_ingredients, preference, user_id=user_id, servings=servings, **options)
    if not result.requirements:
        return RecipeResponse(recipe=result.recipe)
    plan = await create_plan(result, refrigerator_ids, user_id, servings, db)
    return RecipeResponse(recipe=result.recipe, plan_id=plan.id)


async def menu_inventory(refrigerator_ids: list[int], user_id: int, db: AsyncSession):
    await authorize(refrigerator_ids, user_id, db, lock=True)
    rows = await stock_rows(refrigerator_ids, db)
    items = [MenuIngredient(ingredient_id=i.id, name=i.name, quantity=i.quantity, unit=i.unit,
             expiry_date=i.expiry_date, expiry_source=i.expiry_source,
             refrigerator_id=f.id, refrigerator_name=f.name, storage_box_name=b.name)
             for i, b, f in rows]
    items.sort(key=lambda i: (i.expiry_date is None, str(i.expiry_date or ""), i.ingredient_id))
    return MenuInventory(as_of=today_kst(), ingredients=items)
