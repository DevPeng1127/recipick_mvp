import asyncio
import base64
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import httpx

from app.config import settings
from app.services.recipe_usage import (
    REQUEST_TIMEOUT_SECONDS, RecipeRateLimitError, recipe_usage_limiter,
)

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiRequestError(Exception):
    """Expose only safe provider metadata in the message and custom attributes."""

    def __init__(self, kind: str, *, status_code: int | None = None):
        self.kind = kind
        self.status_code = status_code
        super().__init__(f"Gemini request failed ({kind}, status={status_code})")


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
    return await _generate_content([{"text": prompt}], user_id=user_id)


async def call_gemini_image(
    prompt: str, image: bytes, *, user_id: int, response_schema: dict,
) -> str:
    return await _generate_content(
        [{"text": prompt}, {"inlineData": {
            "mimeType": "image/jpeg", "data": base64.b64encode(image).decode("ascii"),
        }}],
        user_id=user_id,
        generation_config={"responseMimeType": "application/json", "responseJsonSchema": response_schema},
    )


async def _generate_content(
    parts: list[dict], *, user_id: int, generation_config: dict | None = None,
) -> str:
    api_key = settings.GEMINI_API_KEY.get_secret_value()
    if not api_key.strip():
        raise ValueError("Gemini API key is not configured")
    url = f"{GEMINI_API_URL}/{settings.GEMINI_MODEL}:generateContent"

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            # Gemini 3 recommends 1.0; leave thinking at the model default
            # (minimal for Gemini 3.5 Flash-Lite).
            "temperature": 1.0,
            "maxOutputTokens": 2048,
            **(generation_config or {}),
        },
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Reserve only after local prompt/configuration work, immediately before I/O.
        async with recipe_usage_limiter.attempt(user_id):
            try:
                response = await asyncio.wait_for(
                    client.post(url, headers={"x-goog-api-key": api_key}, json=payload),
                    timeout=REQUEST_TIMEOUT_SECONDS,
                )
            except (httpx.TimeoutException, asyncio.TimeoutError):
                raise GeminiRequestError("timeout") from None
            except httpx.HTTPError:
                raise GeminiRequestError("transport_error") from None

            if response.status_code == 429:
                raise provider_rate_limit(response)
            # Avoid constructing HTTPStatusError with provider-controlled text/URLs.
            if not response.is_success:
                raise GeminiRequestError("http_error", status_code=response.status_code)
            try:
                data = response.json()
            except ValueError:
                raise GeminiRequestError("invalid_json") from None

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
