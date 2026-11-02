from uuid import UUID
from typing import Annotated

from pydantic import ValidationError
from app.ai.gemini_client import GeminiRequestError
from app.ai.menu import MenuConsistencyError
from app.services import cooking_service
from app.schemas.recipe import CookingCommit, CookingPreview
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.recipe import MenuInventory, RecipeRecommendRequest, RecipeResponse
from app.services.recipe_service import menu_inventory, recommend_recipe
from app.services.recipe_usage import RecipeRateLimitError

router = APIRouter(prefix="/recipes", tags=["recipes"])


@router.get("/ingredients", response_model=MenuInventory)
async def recommendation_ingredients(
    refrigerator_ids: Annotated[list[int], Query(min_length=1, max_length=100)],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await menu_inventory(refrigerator_ids, current_user.id, db)


@router.post("/recommend", response_model=RecipeResponse, response_model_exclude_none=True)
async def recommend(
    body: RecipeRecommendRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await recommend_recipe(body.refrigerator_ids, current_user.id, db, body.servings, body.priority_ingredient_ids)
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc
    except RecipeRateLimitError as exc:
        headers = (
            {"Retry-After": str(exc.retry_after_seconds)}
            if exc.retry_after_seconds is not None else None
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=exc.detail(), headers=headers
        ) from exc
    except MenuConsistencyError:
        raise HTTPException(502, {
            "code": "inconsistent_menu",
            "message": "메뉴 내용의 일관성을 확인하지 못해 결과를 저장하지 않았습니다. 다시 추천받기를 눌러 주세요.",
        }) from None
    except (ValidationError, GeminiRequestError):
        raise HTTPException(502, "메뉴 추천 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.") from None
    return result


@router.get("/{plan_id}/cooking", response_model=CookingPreview)
async def cooking_preview(plan_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await cooking_service.preview(plan_id, user.id, db)


@router.post("/{plan_id}/consume")
async def consume_recipe(plan_id: UUID, body: CookingCommit, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await cooking_service.commit(plan_id, user.id, body, db)


@router.post("/{plan_id}/repeat", response_model=RecipeResponse, status_code=201)
async def repeat_recipe(plan_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    plan = await cooking_service.repeat(plan_id, user.id, db)
    return RecipeResponse(recipe=plan.recipe, plan_id=plan.id)
