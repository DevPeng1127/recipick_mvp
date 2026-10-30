from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.receipt_import import recognize_receipt
from app.api.v1.voice_import import recognize_voice
from app.database.connection import get_db
from app.dependencies.auth import (
    get_current_user, require_refrigerator_member, require_storage_box_member,
)
from app.models.refrigerator import RefrigeratorMember
from app.models.storage import StorageBox
from app.models.user import User
from app.schemas.ingredient import IngredientResponse
from app.schemas.receipt import ReceiptPreview, RefrigeratorIngredientBatchCreate
from app.schemas.storage import StorageBoxResponse
from app.services.ingredient_service import create_ingredient
from app.services.sharing_service import lock_refrigerator

router = APIRouter(tags=["ingredient import"])
FRIDGE = "/refrigerators/{refrigerator_id}/ingredients"


@router.get("/storage-boxes/{storage_box_id}", response_model=StorageBoxResponse)
async def import_storage_context(box: StorageBox = Depends(require_storage_box_member)):
    return box


@router.post(FRIDGE + "/receipt-preview", response_model=ReceiptPreview)
async def receipt_preview(
    request: Request,
    member: RefrigeratorMember = Depends(require_refrigerator_member),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await recognize_receipt(request, current_user, db)


@router.post(FRIDGE + "/voice-preview", response_model=ReceiptPreview)
async def voice_preview(
    request: Request,
    member: RefrigeratorMember = Depends(require_refrigerator_member),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await recognize_voice(request, current_user, db)


@router.post(FRIDGE + "/batch", response_model=list[IngredientResponse], status_code=201)
async def create_distributed_batch(
    refrigerator_id: int,
    body: RefrigeratorIngredientBatchCreate,
    member: RefrigeratorMember = Depends(require_refrigerator_member),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Sharing joins/removals use this same lock. Recheck access after waiting.
    await lock_refrigerator(refrigerator_id, db)
    await require_refrigerator_member(refrigerator_id, current_user, db)
    requested_ids = {item.storage_box_id for item in body.items}
    boxes = (await db.scalars(select(StorageBox).where(
        StorageBox.refrigerator_id == refrigerator_id,
        StorageBox.id.in_(requested_ids),
    ).order_by(StorageBox.id).with_for_update())).all()
    if {box.id for box in boxes} != requested_ids:
        raise HTTPException(409, "보관함이 변경되었거나 이 냉장고에 속하지 않습니다. 보관함을 다시 선택해 주세요.")
    created = [await create_ingredient(item.storage_box_id, item, db) for item in body.items]
    # get_db rolls back every insertion if any flush/commit fails.
    await db.commit()
    return created
