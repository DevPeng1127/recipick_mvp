from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.recipe_graph import run_recipe_graph
from app.services.ingredient_service import list_ingredients_by_refrigerator
from app.services.user_service import get_user_preference


async def recommend_recipe(
    refrigerator_ids: list[int], user_id: int, db: AsyncSession
) -> str:
    all_ingredients = []
    for rid in refrigerator_ids:
        ingredients = await list_ingredients_by_refrigerator(rid, db)
        all_ingredients.extend(ingredients)

    preference = await get_user_preference(user_id, db)

    if not all_ingredients:
        return "선택한 냉장고에 식재료가 없습니다. 식재료를 먼저 등록해주세요."

    # Deduplicate by ingredient name (keep first occurrence)
    seen_names: set[str] = set()
    unique_ingredients = []
    for ingredient in all_ingredients:
        if ingredient.name not in seen_names:
            seen_names.add(ingredient.name)
            unique_ingredients.append(ingredient)

    result = await run_recipe_graph(unique_ingredients, preference)
    return result
