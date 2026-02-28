from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.schemas.auth import (
    LoginUrlResponse,
    OAuthCallbackRequest,
    RefreshTokenRequest,
    TokenResponse,
)
from app.services.auth_service import get_login_url, oauth_callback, refresh_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/{provider}/login-url", response_model=LoginUrlResponse)
async def get_oauth_login_url(provider: str):
    try:
        url = await get_login_url(provider)
        return LoginUrlResponse(login_url=url)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{provider}/callback", response_model=TokenResponse)
async def oauth_callback_endpoint(
    provider: str,
    body: OAuthCallbackRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        tokens = await oauth_callback(provider, body.code, db)
        return TokenResponse(**tokens)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OAuth authentication failed",
        )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    body: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        tokens = await refresh_access_token(body.refresh_token, db)
        return TokenResponse(**tokens)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
