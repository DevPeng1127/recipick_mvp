from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.dependencies.auth import get_current_user, require_refrigerator_member
from app.models.refrigerator import RefrigeratorMember
from app.models.user import User
from app.schemas.recipe import RecipeRecommendRequest, RecipeResponse
from app.services.recipe_service import recommend_recipe

router = APIRouter(prefix="/recipes", tags=["recipes"])


@router.post("/recommend", response_model=RecipeResponse)
async def recommend(
    body: RecipeRecommendRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await recommend_recipe(body.refrigerator_ids, current_user.id, db)
    return RecipeResponse(recipe=result)
