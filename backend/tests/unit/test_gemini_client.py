import json
import secrets
from contextlib import asynccontextmanager

import httpx
from httpx import AsyncClient as HttpxAsyncClient
import pytest

from app.ai import gemini_client
from app.ai.recipe_graph import run_recipe_graph
from app.config import Settings
from tests.factories import make_ingredient, make_user_preference
from app.services.recipe_usage import RecipeRateLimitError


@pytest.fixture
def mock_gemini(monkeypatch):
    # Isolate credentials and use the default model without reading the local .env.
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    config = Settings(
        _env_file=None,
        JWT_SECRET_KEY=secrets.token_urlsafe(32),
        GEMINI_API_KEY="test-only-key",
    )
    monkeypatch.setattr(gemini_client, "settings", config)
    class TestLimiter:
        @asynccontextmanager
        async def attempt(self, user_id):
            assert user_id == 1
            yield
    monkeypatch.setattr(gemini_client, "recipe_usage_limiter", TestLimiter())
    client_type = httpx.AsyncClient
    requests = []

    def install(response):
        def handle(request):
            requests.append(request)
            if isinstance(response, Exception):
                raise response
            return response

        def create_client(**kwargs):
            return client_type(transport=httpx.MockTransport(handle), **kwargs)

        monkeypatch.setattr(gemini_client.httpx, "AsyncClient", create_client)
        return requests

    return install


def completed_response(parts):
    return {
        "candidates": [{"finishReason": "STOP", "content": {"parts": parts}}]
    }


async def test_recipe_graph_calls_flash_lite_and_returns_complete_recipe(mock_gemini):
    recipe = "## 두부 구이\n\n1. 두부를 썰어 굽습니다."
    requests = mock_gemini(httpx.Response(200, json=completed_response([
        {"text": "## 두부 구이\n\n"},
        {"text": "1. 두부를 썰어 굽습니다.", "thoughtSignature": "opaque-signature"},
    ])))
    ingredients = [make_ingredient(name="두부", quantity=1)]
    preference = make_user_preference(allergies=["땅콩"], max_time=30)

    result = await run_recipe_graph(ingredients, preference, user_id=1)

    assert result == recipe
    assert len(requests) == 1
    request = requests[0]
    assert request.method == "POST"
    assert request.url.host == "generativelanguage.googleapis.com"
    assert request.url.path == "/v1beta/models/gemini-3.5-flash-lite:generateContent"
    payload = json.loads(request.content)
    prompt = payload["contents"][0]["parts"][0]["text"]
    assert "두부" in prompt
    assert "땅콩" in prompt
    assert "30분" in prompt
    assert payload["generationConfig"]["temperature"] == 1.0
    assert payload["generationConfig"]["maxOutputTokens"] == 2048
    assert "thinkingConfig" not in payload["generationConfig"]
    assert request.extensions["timeout"]["read"] == 30.0


async def test_ignores_thoughts_and_non_text_parts(mock_gemini):
    mock_gemini(httpx.Response(200, json=completed_response([
        {"text": "Thought summary", "thought": True},
        {"inlineData": {"mimeType": "image/png", "data": "test"}},
        {"text": "## Recipe\n"},
        {"text": "Cook the tofu.", "thought": False},
    ])))

    assert await gemini_client.call_gemini("test prompt", user_id=1) == "## Recipe\nCook the tofu."


@pytest.mark.parametrize("data", [
    {},
    {"candidates": []},
    {"promptFeedback": {"blockReason": "SAFETY"}},
])
async def test_rejects_missing_candidates(mock_gemini, data):
    mock_gemini(httpx.Response(200, json=data))

    with pytest.raises(ValueError, match="No response from Gemini API"):
        await gemini_client.call_gemini("test prompt", user_id=1)


@pytest.mark.parametrize("candidate", [
    {"finishReason": "STOP"},
    {"finishReason": "STOP", "content": {}},
    {"finishReason": "STOP", "content": {"parts": []}},
    completed_response([{"text": "  \n"}])["candidates"][0],
    completed_response([{"text": "Thought summary", "thought": True}])["candidates"][0],
])
async def test_rejects_empty_answers(mock_gemini, candidate):
    mock_gemini(httpx.Response(200, json={"candidates": [candidate]}))

    with pytest.raises(ValueError, match="No text response from Gemini API"):
        await gemini_client.call_gemini("test prompt", user_id=1)


@pytest.mark.parametrize("reason", ["MAX_TOKENS", "SAFETY", "RECITATION", None])
async def test_rejects_incomplete_answer_without_retry(mock_gemini, reason):
    data = completed_response([{"text": "Partially generated recipe"}])
    data["candidates"][0]["finishReason"] = reason
    requests = mock_gemini(httpx.Response(200, json=data))

    with pytest.raises(ValueError, match="did not return a complete response"):
        await gemini_client.call_gemini("test prompt", user_id=1)

    assert len(requests) == 1


@pytest.mark.parametrize("status", [403, 404, 503])
async def test_propagates_http_errors_without_retry_or_fallback(mock_gemini, status):
    requests = mock_gemini(httpx.Response(status, json={"error": {"code": status}}))

    with pytest.raises(httpx.HTTPStatusError) as error:
        await gemini_client.call_gemini("test prompt", user_id=1)

    assert error.value.response.status_code == status
    assert len(requests) == 1


async def test_propagates_timeout_without_retry(mock_gemini):
    requests = mock_gemini(httpx.ReadTimeout("Test timeout"))

    with pytest.raises(httpx.ReadTimeout):
        await gemini_client.call_gemini("test prompt", user_id=1)

    assert len(requests) == 1


@pytest.mark.parametrize("retry_after", [None, "17", "invalid"])
async def test_provider_limit_returns_safe_message_without_retry(mock_gemini, retry_after):
    headers = {"Retry-After": retry_after} if retry_after else {}
    requests = mock_gemini(httpx.Response(
        429, headers=headers, json={"error": {"message": "test-only-key private provider detail"}},
    ))
    with pytest.raises(RecipeRateLimitError) as error:
        await gemini_client.call_gemini("test prompt", user_id=1)
    assert error.value.code == "provider_rate_limit"
    assert error.value.retry_after_seconds == (17 if retry_after == "17" else None)
    assert "test-only-key" not in str(error.value.detail())
    assert len(requests) == 1


async def test_rejected_reservation_does_not_contact_gemini(mock_gemini, monkeypatch):
    requests = mock_gemini(httpx.Response(200, json=completed_response([{"text": "Recipe"}])))
    class RejectingLimiter:
        @asynccontextmanager
        async def attempt(self, user_id):
            raise RecipeRateLimitError("user_daily_limit", "Daily limit")
            yield
    monkeypatch.setattr(gemini_client, "recipe_usage_limiter", RejectingLimiter())
    with pytest.raises(RecipeRateLimitError):
        await gemini_client.call_gemini("test prompt", user_id=1)
    assert not requests


async def test_missing_key_does_not_reserve_usage(mock_gemini, monkeypatch):
    from unittest.mock import AsyncMock
    requests = mock_gemini(httpx.Response(200, json={}))
    monkeypatch.setattr(gemini_client.settings, "GEMINI_API_KEY", "")
    limiter = AsyncMock()
    monkeypatch.setattr(gemini_client, "recipe_usage_limiter", limiter)
    with pytest.raises(ValueError, match="key is not configured"):
        await gemini_client.call_gemini("test prompt", user_id=1)
    limiter.attempt.assert_not_called()
    assert not requests


async def test_absolute_request_timeout_finishes_lease(mock_gemini, monkeypatch):
    import asyncio
    events = []
    mock_gemini(httpx.Response(200, json={}))
    class RecordingLimiter:
        @asynccontextmanager
        async def attempt(self, user_id):
            events.append("reserved")
            try:
                yield
            finally:
                events.append("finished")
    async def slow_post(*args, **kwargs):
        events.append("called")
        await asyncio.Event().wait()
    # The mock client factory returns the real httpx class with a mock transport.
    monkeypatch.setattr(HttpxAsyncClient, "post", slow_post)
    monkeypatch.setattr(gemini_client, "recipe_usage_limiter", RecordingLimiter())
    monkeypatch.setattr(gemini_client, "REQUEST_TIMEOUT_SECONDS", 0.01)
    with pytest.raises(asyncio.TimeoutError):
        await gemini_client.call_gemini("test prompt", user_id=1)
    assert events == ["reserved", "called", "finished"]
