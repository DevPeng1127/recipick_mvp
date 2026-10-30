import json
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select, text

from app.models.ingredient import Ingredient
from tests.integration.test_consume_dispose import (
    auth_headers, inventory_sessions, snapshot, transactional_client,
)
from tests.unit.test_receipt_import import picture, receipt


BASE = "/api/v1/storage-boxes/100/ingredients"
ITEMS = [{"name": "우유 1L", "quantity": 2, "unit": "팩", "expiry_date": None},
         {"name": "계란", "quantity": 10, "unit": "개", "expiry_date": "2026-11-01"}]


async def test_preview_uses_real_permissions_and_never_writes_inventory(
    transactional_client, inventory_sessions, monkeypatch,
):
    from app.services import receipt_service
    call = AsyncMock(return_value=json.dumps(receipt()))
    monkeypatch.setattr(receipt_service, "call_gemini_image", call)
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(
        f"{BASE}/receipt-preview", content=picture(),
        headers={**auth_headers(2), "Content-Type": "image/png"},
    )
    assert response.status_code == 200, response.text
    assert response.json() == receipt()
    assert await snapshot(inventory_sessions) == before
    assert call.call_args.kwargs["user_id"] == 2


async def test_batch_creates_confirmed_items_in_one_commit(transactional_client, inventory_sessions):
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(f"{BASE}/batch", json={"items": ITEMS}, headers=auth_headers(2))
    assert response.status_code == 201, response.text
    assert len(response.json()) == 2
    async with inventory_sessions() as db:
        rows = (await db.scalars(select(Ingredient).where(Ingredient.name.in_(["우유 1L", "계란"])))).all()
        assert len(rows) == 2
        assert all(row.storage_box_id == 100 for row in rows)
        assert sorted((row.name, row.quantity, row.unit) for row in rows) == [("계란", 10, "개"), ("우유 1L", 2, "팩")]
    after = await snapshot(inventory_sessions)
    assert len(after["ingredients"]) == len(before["ingredients"]) + 2
    assert after["logs"] == before["logs"]


async def test_batch_db_failure_rolls_back_every_item(transactional_client, inventory_sessions, test_engine):
    async with test_engine.begin() as db:
        await db.execute(text("ALTER TABLE ingredients ADD CONSTRAINT reject_egg CHECK (name <> '계란')"))
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(f"{BASE}/batch", json={"items": ITEMS}, headers=auth_headers(1))
    assert response.status_code == 500
    assert await snapshot(inventory_sessions) == before


@pytest.mark.parametrize("items", [[], ITEMS * 11, [ITEMS[0], {**ITEMS[1], "quantity": 0}]])
async def test_invalid_batch_writes_nothing(transactional_client, inventory_sessions, items):
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(f"{BASE}/batch", json={"items": items}, headers=auth_headers(1))
    assert response.status_code == 422
    assert await snapshot(inventory_sessions) == before


@pytest.mark.parametrize("suffix", ["receipt-preview", "batch"])
async def test_nonmember_cannot_preview_or_save(transactional_client, inventory_sessions, suffix):
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(f"{BASE}/{suffix}", json={"items": ITEMS}, headers=auth_headers(3))
    assert response.status_code == 403
    assert await snapshot(inventory_sessions) == before


@pytest.mark.parametrize("body,mime,status", [
    (b"bad", "image/png", 400), (b"", "image/png", 400),
    (picture(), "image/gif", 415), (b"x" * (5 * 1024 * 1024 + 1), "image/png", 413),
], ids=["corrupt", "empty", "unsupported", "oversized"])
async def test_invalid_upload_never_calls_ai(transactional_client, inventory_sessions, monkeypatch, body, mime, status):
    from app.services import receipt_service
    call = AsyncMock()
    monkeypatch.setattr(receipt_service, "call_gemini_image", call)
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(f"{BASE}/receipt-preview", content=body,
                                              headers={**auth_headers(1), "Content-Type": mime})
    assert response.status_code == status
    call.assert_not_awaited()
    assert await snapshot(inventory_sessions) == before


@pytest.mark.parametrize("base", [BASE, "/api/v1/refrigerators/10/ingredients"])
async def test_receipt_voice_and_recipe_share_real_database_quota(
    transactional_client, inventory_sessions, monkeypatch, base,
):
    import httpx
    from pydantic import SecretStr
    from app.ai import gemini_client
    from app.services.recipe_usage import recipe_usage_limiter
    from app.models.recipe_usage import RecipeUsageAttempt
    from tests.unit.test_voice_import import recording
    requests = []
    client_type = httpx.AsyncClient

    def respond(request):
        requests.append(request)
        body = json.loads(request.content)
        is_import = any("inlineData" in part for part in body["contents"][0]["parts"])
        answer = json.dumps(receipt()) if is_import else "추천 레시피"
        return httpx.Response(200, json={"candidates": [{
            "finishReason": "STOP", "content": {"parts": [{"text": answer}]},
        }]})

    monkeypatch.setattr(gemini_client.settings, "GEMINI_API_KEY", SecretStr("test-only"))
    monkeypatch.setattr(gemini_client.httpx, "AsyncClient", lambda **kw: client_type(transport=httpx.MockTransport(respond), **kw))
    monkeypatch.setattr(recipe_usage_limiter, "session_factory", inventory_sessions)
    await gemini_client.call_gemini("recipe", user_id=1)
    response = await transactional_client.post(f"{base}/receipt-preview", content=picture(),
                                              headers={**auth_headers(1), "Content-Type": "image/png"})
    assert response.status_code == 200, response.text
    voice = await transactional_client.post(f"{base}/voice-preview", content=recording(),
                                           headers={**auth_headers(1), "Content-Type": "audio/wav"})
    assert voice.status_code == 200
    limited = await transactional_client.post(f"{base}/receipt-preview", content=picture(),
                                             headers={**auth_headers(1), "Content-Type": "image/png"})
    assert limited.status_code == 429
    assert limited.json()["detail"]["code"] == "user_minute_limit"
    assert len(requests) == 3
    payload = json.loads(requests[1].content)
    assert payload["generationConfig"]["responseMimeType"] == "application/json"
    assert payload["contents"][0]["parts"][1]["inlineData"]["mimeType"] == "image/jpeg"
    voice_payload = json.loads(requests[2].content)
    assert voice_payload["contents"][0]["parts"][1]["inlineData"]["mimeType"] == "audio/wav"
    assert voice_payload["generationConfig"]["responseMimeType"] == "application/json"
    async with inventory_sessions() as db:
        attempts = list((await db.scalars(select(RecipeUsageAttempt))).all())
        assert len(attempts) == 3 and all(row.finished_at is not None for row in attempts)
