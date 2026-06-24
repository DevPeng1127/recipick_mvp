from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.dependencies.auth import get_current_user, require_refrigerator_member, require_storage_box_member
from app.models.ingredient_log import ActionType
from app.models.refrigerator import Refrigerator, RefrigeratorMember
from app.models.storage import StorageBox
from app.models.user import User
from app.schemas.ingredient import (
    ConsumeDisposeRequest,
    IngredientCreate,
    IngredientResponse,
    IngredientSearchResult,
    IngredientUpdate,
)
from app.services.ingredient_service import (
    consume_or_dispose_ingredient,
    create_ingredient,
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
    storage_box: StorageBox = Depends(require_storage_box_member),
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
    storage_box: StorageBox = Depends(require_storage_box_member),
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
    storage_box: StorageBox = Depends(require_storage_box_member),
    db: AsyncSession = Depends(get_db),
):
    ingredient = await update_ingredient(ingredient_id, storage_box_id, data, db)
    if ingredient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ingredient not found")
    return ingredient


async def _consume_or_dispose(
    storage_box_id: int,
    ingredient_id: int,
    action_type: ActionType,
    body: ConsumeDisposeRequest,
    storage_box: StorageBox,
    current_user: User,
    db: AsyncSession,
) -> Response:
    # 냉장고 이름 조회
    result = await db.execute(
        select(Refrigerator).where(Refrigerator.id == storage_box.refrigerator_id)
    )
    refrigerator = result.scalar_one()

    try:
        updated = await consume_or_dispose_ingredient(
            ingredient_id=ingredient_id,
            storage_box_id=storage_box_id,
            user_id=current_user.id,
            refrigerator_name=refrigerator.name,
            refrigerator_id=refrigerator.id,
            action_type=action_type,
            data=body,
            db=db,
        )
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ingredient not found")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if updated is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return updated


@router.post(
    "/storage-boxes/{storage_box_id}/ingredients/{ingredient_id}/consume",
    response_model=IngredientResponse,
    responses={204: {"description": "전량 소비됨"}},
)
async def consume(
    storage_box_id: int,
    ingredient_id: int,
    body: ConsumeDisposeRequest = ConsumeDisposeRequest(),
    storage_box: StorageBox = Depends(require_storage_box_member),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _consume_or_dispose(
        storage_box_id, ingredient_id, ActionType.CONSUMED, body, storage_box, current_user, db
    )


@router.post(
    "/storage-boxes/{storage_box_id}/ingredients/{ingredient_id}/dispose",
    response_model=IngredientResponse,
    responses={204: {"description": "전량 폐기됨"}},
)
async def dispose(
    storage_box_id: int,
    ingredient_id: int,
    body: ConsumeDisposeRequest = ConsumeDisposeRequest(),
    storage_box: StorageBox = Depends(require_storage_box_member),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _consume_or_dispose(
        storage_box_id, ingredient_id, ActionType.DISPOSED, body, storage_box, current_user, db
    )


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
