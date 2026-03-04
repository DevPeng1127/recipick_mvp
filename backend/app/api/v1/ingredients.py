from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.dependencies.auth import get_current_user, require_refrigerator_member
from app.models.refrigerator import RefrigeratorMember
from app.models.user import User
from app.schemas.ingredient import (
    IngredientCreate,
    IngredientResponse,
    IngredientSearchResult,
    IngredientUpdate,
)
from app.services.ingredient_service import (
    create_ingredient,
    delete_ingredient,
    list_ingredients_by_refrigerator,
    list_ingredients_by_storage_box,
    search_ingredients,
    update_ingredient,
)

router = APIRouter(tags=["ingredients"])


@router.get("/ingredients/search", response_model=list[IngredientSearchResult])
async def search(
    q: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not q.strip():
        return []
    return await search_ingredients(current_user.id, q.strip(), db)


@router.get(
    "/storage-boxes/{storage_box_id}/ingredients",
    response_model=list[IngredientResponse],
)
async def list_by_storage_box(
    storage_box_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_ingredients_by_storage_box(storage_box_id, db)


@router.post(
    "/storage-boxes/{storage_box_id}/ingredients",
    response_model=IngredientResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create(
    storage_box_id: int,
    data: IngredientCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_ingredient(storage_box_id, data, db)


@router.put(
    "/storage-boxes/{storage_box_id}/ingredients/{ingredient_id}",
    response_model=IngredientResponse,
)
async def update(
    storage_box_id: int,
    ingredient_id: int,
    data: IngredientUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ingredient = await update_ingredient(ingredient_id, storage_box_id, data, db)
    if ingredient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ingredient not found")
    return ingredient


@router.delete(
    "/storage-boxes/{storage_box_id}/ingredients/{ingredient_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete(
    storage_box_id: int,
    ingredient_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await delete_ingredient(ingredient_id, storage_box_id, db)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ingredient not found")


@router.get(
    "/refrigerators/{refrigerator_id}/ingredients",
    response_model=list[IngredientResponse],
)
async def list_by_refrigerator(
    refrigerator_id: int,
    member: RefrigeratorMember = Depends(require_refrigerator_member),
    db: AsyncSession = Depends(get_db),
):
    return await list_ingredients_by_refrigerator(refrigerator_id, db)
