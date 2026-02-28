from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.utils.oauth import exchange_google_code, exchange_kakao_code
from app.utils.security import create_access_token, create_refresh_token, decode_token


async def get_login_url(provider: str) -> str:
    from app.utils.oauth import get_google_login_url, get_kakao_login_url

    if provider == "kakao":
        return await get_kakao_login_url()
    elif provider == "google":
        return await get_google_login_url()
    raise ValueError(f"Unsupported provider: {provider}")


async def oauth_callback(provider: str, code: str, db: AsyncSession) -> dict:
    if provider == "kakao":
        oauth_data = await exchange_kakao_code(code)
    elif provider == "google":
        oauth_data = await exchange_google_code(code)
    else:
        raise ValueError(f"Unsupported provider: {provider}")

    result = await db.execute(
        select(User).where(
            User.oauth_provider == oauth_data["oauth_provider"],
            User.oauth_id == oauth_data["oauth_id"],
        )
    )
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            oauth_provider=oauth_data["oauth_provider"],
            oauth_id=oauth_data["oauth_id"],
            nickname=oauth_data["nickname"],
        )
        db.add(user)
        await db.flush()

    return {
        "access_token": create_access_token(user.id),
        "refresh_token": create_refresh_token(user.id),
        "token_type": "bearer",
    }


async def refresh_access_token(refresh_token: str, db: AsyncSession) -> dict:
    payload = decode_token(refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise ValueError("Invalid refresh token")

    user_id = int(payload["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise ValueError("User not found")

    return {
        "access_token": create_access_token(user.id),
        "refresh_token": create_refresh_token(user.id),
        "token_type": "bearer",
    }
