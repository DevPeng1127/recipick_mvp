from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.recipe_graph import run_recipe_graph
from app.services.ingredient_service import list_ingredients_by_refrigerator
from app.services.user_service import get_user_preference


async def recommend_recipe(
    refrigerator_id: int, user_id: int, db: AsyncSession
) -> str:
    ingredients = await list_ingredients_by_refrigerator(refrigerator_id, db)
    preference = await get_user_preference(user_id, db)

    if not ingredients:
        return "냉장고에 식재료가 없습니다. 식재료를 먼저 등록해주세요."

    result = await run_recipe_graph(ingredients, preference)
    return result
