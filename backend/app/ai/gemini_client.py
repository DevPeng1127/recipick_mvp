import asyncio
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import httpx

from app.config import settings
from app.services.recipe_usage import (
    REQUEST_TIMEOUT_SECONDS, RecipeRateLimitError, recipe_usage_limiter,
)

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"


def provider_rate_limit(response: httpx.Response) -> RecipeRateLimitError:
    now = datetime.now(timezone.utc)
    retry_at = None
    retry_header = response.headers.get("Retry-After", "")
    try:
        if retry_header.isdigit():
            retry_at = now + timedelta(seconds=int(retry_header))
        elif retry_header:
            retry_at = parsedate_to_datetime(retry_header)
            if retry_at.tzinfo is None:
                retry_at = retry_at.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError, OverflowError):
        retry_at = None
    return RecipeRateLimitError(
        "provider_rate_limit", "AI 제공자의 사용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
        now=now, retry_at=retry_at,
    )


async def call_gemini(prompt: str, *, user_id: int) -> str:
    if not settings.GEMINI_API_KEY.strip():
        raise ValueError("Gemini API key is not configured")
    url = f"{GEMINI_API_URL}/{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            # Gemini 3 recommends 1.0; leave thinking at the model default
            # (minimal for Gemini 3.5 Flash-Lite).
            "temperature": 1.0,
            "maxOutputTokens": 2048,
        },
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Reserve only after local prompt/configuration work, immediately before I/O.
        async with recipe_usage_limiter.attempt(user_id):
            response = await asyncio.wait_for(
                client.post(url, json=payload), timeout=REQUEST_TIMEOUT_SECONDS
            )
            if response.status_code == 429:
                raise provider_rate_limit(response)
            response.raise_for_status()
            data = response.json()

    candidates = data.get("candidates", [])
    if not candidates:
        raise ValueError("No response from Gemini API")

    candidate = candidates[0]
    if candidate.get("finishReason") != "STOP":
        raise ValueError("Gemini API did not return a complete response")

    parts = candidate.get("content", {}).get("parts", [])
    text = "".join(
        part["text"]
        for part in parts
        if isinstance(part.get("text"), str) and not part.get("thought", False)
    )
    if not text.strip():
        raise ValueError("No text response from Gemini API")

    return text
