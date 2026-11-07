from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.dependencies.auth import get_current_user, lock_storage_box_for_write, require_refrigerator_member, require_storage_box_member
from app.models.ingredient_log import ActionType
from app.models.refrigerator import RefrigeratorMember
from app.models.storage import StorageBox
from app.models.user import User
from app.schemas.ingredient import (
    BulkIngredientActionRequest,
    ConsumeDisposeRequest,
    IngredientCreate,
    IngredientResponse,
    IngredientSearchResult,
    IngredientUpdate,
)
from app.services.ingredient_service import (
    bulk_action_ingredients,
    consume_or_dispose_ingredient,
    create_ingredient,
    delete_ingredient,
    list_ingredients_by_refrigerator,
    list_ingredients_by_storage_box,
    search_ingredients,
    update_ingredient,
)
from app.services.sharing_service import lock_refrigerator
from app.services.inventory_locks import lock_storage_boxes

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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await lock_storage_box_for_write(storage_box, current_user, db)
    ingredient = await create_ingredient(storage_box_id, data, db)
    await db.commit()
    return ingredient


@router.post(
    "/storage-boxes/{storage_box_id}/ingredients/bulk-action",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def bulk_action(
    storage_box_id: int,
    data: BulkIngredientActionRequest,
    storage_box: StorageBox = Depends(require_storage_box_member),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    refrigerator = await lock_refrigerator(storage_box.refrigerator_id, db)
    await require_refrigerator_member(storage_box.refrigerator_id, current_user, db)
    await lock_storage_boxes([refrigerator.id], db, storage_box_ids=[storage_box_id], read=True)
    try:
        await bulk_action_ingredients(storage_box_id, current_user.id, refrigerator, data, db)
    except ValueError:
        raise HTTPException(409, detail={
            "code": "inventory_changed",
            "message": "선택한 식재료가 변경되었습니다. 목록을 새로고침한 뒤 다시 선택해 주세요.",
        })
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/storage-boxes/{storage_box_id}/ingredients/{ingredient_id}",
    response_model=IngredientResponse,
)
async def update(
    storage_box_id: int,
    ingredient_id: int,
    data: IngredientUpdate,
    storage_box: StorageBox = Depends(require_storage_box_member),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await lock_storage_box_for_write(storage_box, current_user, db)
    try:
        ingredient = await update_ingredient(ingredient_id, storage_box_id, data, db)
    except ValueError as error:
        raise HTTPException(422, detail=str(error))
    if ingredient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ingredient not found")
    await db.commit()
    return ingredient


@router.delete(
    "/storage-boxes/{storage_box_id}/ingredients/{ingredient_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_registration(
    storage_box_id: int,
    ingredient_id: int,
    storage_box: StorageBox = Depends(require_storage_box_member),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Sharing changes use this lock; recheck access after waiting for it.
    await lock_refrigerator(storage_box.refrigerator_id, db)
    await require_refrigerator_member(storage_box.refrigerator_id, current_user, db)
    await lock_storage_boxes([storage_box.refrigerator_id], db, storage_box_ids=[storage_box_id], read=True)
    await delete_ingredient(ingredient_id, storage_box_id, db)
    # An already absent item also succeeds, so a lost response can be retried safely.
    # Explicitly commit before reporting success. get_db rolls back any failure.
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _consume_or_dispose(
    storage_box_id: int,
    ingredient_id: int,
    action_type: ActionType,
    body: ConsumeDisposeRequest,
    storage_box: StorageBox,
    current_user: User,
    db: AsyncSession,
) -> Response:
    refrigerator = await lock_storage_box_for_write(storage_box, current_user, db)

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

    await db.commit()
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
