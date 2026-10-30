from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gemini_client import GeminiRequestError
from app.database.connection import get_db
from app.dependencies.auth import get_current_user, require_storage_box_member
from app.models.storage import StorageBox
from app.models.user import User
from app.schemas.ingredient import IngredientResponse
from app.schemas.receipt import IngredientBatchCreate, ReceiptPreview
from app.services.ingredient_service import create_ingredient
from app.services.receipt_service import IMAGE_FORMATS, MAX_IMAGE_BYTES, preview_receipt
from app.services.recipe_usage import RecipeRateLimitError


router = APIRouter(prefix="/storage-boxes/{storage_box_id}/ingredients", tags=["receipt import"])


@router.post("/receipt-preview", response_model=ReceiptPreview)
async def receipt_preview(
    request: Request,
    storage_box: StorageBox = Depends(require_storage_box_member),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await recognize_receipt(request, current_user, db)


async def recognize_receipt(request: Request, current_user: User, db: AsyncSession):
    mime_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if mime_type not in IMAGE_FORMATS:
        raise HTTPException(415, "JPEG 또는 PNG 사진만 사용할 수 있습니다.")
    # Stream into bounded memory; multipart UploadFile can spool to disk.
    content = bytearray()
    async for chunk in request.stream():
        if len(content) + len(chunk) > MAX_IMAGE_BYTES:
            raise HTTPException(413, "사진은 5MB 이하여야 합니다.")
        content.extend(chunk)
    user_id = current_user.id
    # Release the authorization transaction before AI reserves its own connection.
    await db.commit()
    try:
        return await preview_receipt(bytes(content), mime_type, user_id=user_id)
    except RecipeRateLimitError as exc:
        headers = {"Retry-After": str(exc.retry_after_seconds)} if exc.retry_after_seconds is not None else None
        raise HTTPException(429, exc.detail(), headers=headers) from None
    except GeminiRequestError:
        raise HTTPException(502, "영수증을 인식하지 못했습니다. 잠시 후 다시 시도해 주세요.") from None
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None


@router.post("/batch", response_model=list[IngredientResponse], status_code=201)
async def create_batch(
    storage_box_id: int,
    body: IngredientBatchCreate,
    storage_box: StorageBox = Depends(require_storage_box_member),
    db: AsyncSession = Depends(get_db),
):
    created = []
    for item in body.items:
        created.append(await create_ingredient(storage_box_id, item, db))
    # Commit before returning success; any failure rolls back the entire batch via get_db.
    await db.commit()
    return created
