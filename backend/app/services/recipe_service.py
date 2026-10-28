from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.recipe_graph import run_recipe_graph
from app.models.refrigerator import RefrigeratorMember
from app.services.ingredient_service import list_ingredients_by_refrigerator
from app.schemas.recipe import RecipeResponse
from app.services.cooking_service import create_plan
from app.services.user_service import get_user_preference


async def recommend_recipe(
    refrigerator_ids: list[int], user_id: int, db: AsyncSession, servings: int = 1
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

    preference = await get_user_preference(user_id, db)

    if not all_ingredients:
        return RecipeResponse(recipe="선택한 냉장고에 식재료가 없습니다. 식재료를 먼저 등록해주세요.")

    # Release the read transaction before the limiter opens its own transaction.
    # Otherwise concurrent requests can exhaust the connection pool while waiting.
    await db.commit()
    result = await run_recipe_graph(all_ingredients, preference, user_id=user_id, servings=servings)
    plan = await create_plan(result, refrigerator_ids, user_id, servings, db)
    return RecipeResponse(recipe=result.recipe, plan_id=plan.id)
