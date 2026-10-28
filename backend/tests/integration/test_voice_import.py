import json
from unittest.mock import AsyncMock

import pytest

from app.ai.gemini_client import GeminiRequestError
from tests.integration.test_consume_dispose import auth_headers, inventory_sessions, snapshot, transactional_client
from tests.unit.test_receipt_import import receipt
from tests.unit.test_voice_import import recording

URL = "/api/v1/storage-boxes/100/ingredients/voice-preview"


async def test_voice_preview_authorizes_member_and_does_not_save(transactional_client, inventory_sessions, monkeypatch):
    from app.services import voice_service
    call = AsyncMock(return_value=json.dumps(receipt()))
    monkeypatch.setattr(voice_service, "call_gemini_audio", call)
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(URL, content=recording(), headers={**auth_headers(2), "Content-Type": "audio/wav"})
    assert response.status_code == 200
    assert response.json() == receipt()
    assert call.call_args.kwargs["user_id"] == 2
    assert await snapshot(inventory_sessions) == before


@pytest.mark.parametrize("headers,status", [({}, 401), (auth_headers(3), 403)])
async def test_unauthorized_voice_does_not_call_provider(transactional_client, inventory_sessions, monkeypatch, headers, status):
    from app.services import voice_service
    call = AsyncMock()
    monkeypatch.setattr(voice_service, "call_gemini_audio", call)
    response = await transactional_client.post(URL, content=recording(), headers={**headers, "Content-Type": "audio/wav"})
    assert response.status_code == status
    call.assert_not_awaited()


@pytest.mark.parametrize("body,mime,status", [
    (b"", "audio/wav", 400), (b"bad", "audio/wav", 400),
    (recording(), "audio/webm", 415), (b"x" * (2 * 1024 * 1024 + 1), "audio/wav", 413),
    (recording(silent=True), "audio/wav", 400), (recording(60.01), "audio/wav", 400),
], ids=["empty", "corrupt", "wrong-mime", "oversize", "silent", "over-duration"])
async def test_invalid_voice_does_not_call_provider_or_write(transactional_client, inventory_sessions, monkeypatch, body, mime, status):
    from app.services import voice_service
    call = AsyncMock()
    monkeypatch.setattr(voice_service, "call_gemini_audio", call)
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(URL, content=body, headers={**auth_headers(1), "Content-Type": mime})
    assert response.status_code == status
    call.assert_not_awaited()
    assert await snapshot(inventory_sessions) == before


async def test_voice_provider_failure_is_safe_and_never_saves(transactional_client, inventory_sessions, monkeypatch):
    from app.services import voice_service
    monkeypatch.setattr(voice_service, "call_gemini_audio", AsyncMock(side_effect=GeminiRequestError("transport_error")))
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(URL, content=recording(), headers={**auth_headers(1), "Content-Type": "audio/wav"})
    assert response.status_code == 502
    assert response.json()["detail"] == "음성을 인식하지 못했습니다. 잠시 후 다시 시도해 주세요."
    assert await snapshot(inventory_sessions) == before
