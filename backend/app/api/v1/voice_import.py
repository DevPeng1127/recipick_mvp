from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gemini_client import GeminiRequestError
from app.database.connection import get_db
from app.dependencies.auth import get_current_user, require_storage_box_member
from app.models.storage import StorageBox
from app.models.user import User
from app.schemas.receipt import ReceiptPreview
from app.services.recipe_usage import RecipeRateLimitError
from app.services.voice_service import MAX_AUDIO_BYTES, preview_voice

router = APIRouter(prefix="/storage-boxes/{storage_box_id}/ingredients", tags=["voice import"])


@router.post("/voice-preview", response_model=ReceiptPreview)
async def voice_preview(
    request: Request,
    storage_box: StorageBox = Depends(require_storage_box_member),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await recognize_voice(request, current_user, db)


async def recognize_voice(request: Request, current_user: User, db: AsyncSession):
    mime_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if mime_type != "audio/wav":
        raise HTTPException(415, "앱에서 녹음한 WAV 음성만 사용할 수 있습니다.")
    content = bytearray()
    async for chunk in request.stream():
        if len(content) + len(chunk) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "녹음은 2MB 이하여야 합니다.")
        content.extend(chunk)
    user_id = current_user.id
    await db.commit()
    try:
        return await preview_voice(bytes(content), user_id=user_id)
    except RecipeRateLimitError as exc:
        headers = {"Retry-After": str(exc.retry_after_seconds)} if exc.retry_after_seconds is not None else None
        raise HTTPException(429, exc.detail(), headers=headers) from None
    except GeminiRequestError:
        raise HTTPException(502, "음성을 인식하지 못했습니다. 잠시 후 다시 시도해 주세요.") from None
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None
