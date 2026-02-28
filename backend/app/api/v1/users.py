from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.user import UserPreferenceResponse, UserPreferenceUpdate, UserResponse
from app.services.user_service import get_user_preference, upsert_user_preference

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/me/preference", response_model=UserPreferenceResponse | None)
async def get_my_preference(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    preference = await get_user_preference(current_user.id, db)
    return preference


@router.put("/me/preference", response_model=UserPreferenceResponse)
async def update_my_preference(
    data: UserPreferenceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    preference = await upsert_user_preference(current_user.id, data, db)
    return preference
