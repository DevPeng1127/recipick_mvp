import asyncio
import json
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import delete, text

from app.models.refrigerator import MemberRole, RefrigeratorMember
from app.models.storage import StorageBox, StorageType
from tests.integration.test_consume_dispose import (
    auth_headers, inventory_sessions, snapshot, transactional_client,
)
from tests.unit.test_receipt_import import picture, receipt
from tests.unit.test_voice_import import recording

BASE = "/api/v1/refrigerators/10/ingredients"
ITEMS = [dict(name="우유 1L", quantity=2, unit="팩", expiry_date=None, storage_box_id=100),
         dict(name="만두", quantity=1, unit="봉", expiry_date="2026-11-30", storage_box_id=101)]


@pytest.fixture(autouse=True)
async def second_box(inventory_sessions):
    async with inventory_sessions.begin() as db:
        db.add(StorageBox(id=101, refrigerator_id=10, name="냉동실", type=StorageType.FREEZER))


@pytest.mark.parametrize("user_id", [1, 2])
async def test_distribute_and_preserve_existing_inventory(transactional_client, inventory_sessions, user_id):
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(f"{BASE}/batch", json={"items": ITEMS}, headers=auth_headers(user_id))
    assert response.status_code == 201, response.text
    assert [{k: row[k] for k in ITEMS[0]} for row in response.json()] == ITEMS
    after = await snapshot(inventory_sessions)
    assert len(after["ingredients"]) == len(before["ingredients"]) + 2
    original_ids = {row["id"] for row in before["ingredients"]}
    assert [row for row in after["ingredients"] if row["id"] in original_ids] == before["ingredients"]
    assert after["logs"] == before["logs"]


@pytest.mark.parametrize("box_id", [200, 999999])
async def test_other_fridge_even_if_accessible_or_missing_box_rejects_entire_batch(
    transactional_client, inventory_sessions, box_id,
):
    async with inventory_sessions.begin() as db:
        db.add(RefrigeratorMember(refrigerator_id=20, user_id=1, role=MemberRole.GUEST))
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(f"{BASE}/batch",
        json={"items": [ITEMS[0], {**ITEMS[1], "storage_box_id": box_id}]}, headers=auth_headers(1))
    assert response.status_code == 409
    assert await snapshot(inventory_sessions) == before


async def test_deleted_destination_rejects_every_item(transactional_client, inventory_sessions):
    async with inventory_sessions.begin() as db:
        await db.execute(delete(StorageBox).where(StorageBox.id == 101))
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(f"{BASE}/batch", json={"items": ITEMS}, headers=auth_headers(2))
    assert response.status_code == 409
    assert await snapshot(inventory_sessions) == before


async def test_database_failure_rolls_back_other_boxes(transactional_client, inventory_sessions, test_engine):
    async with test_engine.begin() as db:
        await db.execute(text("ALTER TABLE ingredients ADD CONSTRAINT reject_dumpling CHECK (name <> '만두')"))
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(f"{BASE}/batch", json={"items": ITEMS}, headers=auth_headers(1))
    assert response.status_code == 500
    assert await snapshot(inventory_sessions) == before


@pytest.mark.parametrize("items", [[], ITEMS * 11, [dict(name="우유", quantity=1, unit="개")],
    [{**ITEMS[0], "storage_box_id": True}], [{**ITEMS[0], "quantity": 0}]])
async def test_invalid_batch_changes_nothing(transactional_client, inventory_sessions, items):
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(f"{BASE}/batch", json={"items": items}, headers=auth_headers(1))
    assert response.status_code == 422
    assert await snapshot(inventory_sessions) == before


@pytest.mark.parametrize("suffix", ["receipt-preview", "voice-preview", "batch"])
async def test_nonmember_is_rejected_before_ai_or_writes(transactional_client, inventory_sessions, monkeypatch, suffix):
    from app.services import receipt_service, voice_service
    image, audio = AsyncMock(), AsyncMock()
    monkeypatch.setattr(receipt_service, "call_gemini_image", image)
    monkeypatch.setattr(voice_service, "call_gemini_audio", audio)
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(f"{BASE}/{suffix}", json={"items": ITEMS}, headers=auth_headers(3))
    assert response.status_code == 403
    image.assert_not_awaited(); audio.assert_not_awaited()
    assert await snapshot(inventory_sessions) == before


@pytest.mark.parametrize("mode", ["receipt", "voice"])
async def test_refrigerator_preview_reuses_recognition_without_inventory_write(
    transactional_client, inventory_sessions, monkeypatch, mode,
):
    from app.services import receipt_service, voice_service
    call = AsyncMock(return_value=json.dumps(receipt()))
    monkeypatch.setattr(receipt_service if mode == "receipt" else voice_service,
                        "call_gemini_image" if mode == "receipt" else "call_gemini_audio", call)
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(f"{BASE}/{mode}-preview",
        content=picture() if mode == "receipt" else recording(),
        headers={**auth_headers(2), "Content-Type": "image/png" if mode == "receipt" else "audio/wav"})
    assert response.status_code == 200, response.text
    assert response.json() == receipt()
    assert call.call_args.kwargs["user_id"] == 2
    assert await snapshot(inventory_sessions) == before


@pytest.mark.parametrize("mode,mime,body,status", [
    ("receipt", "image/png", b"bad", 400), ("receipt", "text/plain", b"bad", 415),
    ("receipt", "image/png", b"x" * (5 * 1024 * 1024 + 1), 413),
    ("voice", "audio/wav", b"bad", 400), ("voice", "text/plain", b"bad", 415),
    ("voice", "audio/wav", b"x" * (2 * 1024 * 1024 + 1), 413),
], ids=["bad-image", "image-type", "image-size", "bad-audio", "audio-type", "audio-size"])
async def test_upload_validation_before_ai(transactional_client, monkeypatch, mode, mime, body, status):
    from app.services import receipt_service, voice_service
    image, audio = AsyncMock(), AsyncMock()
    monkeypatch.setattr(receipt_service, "call_gemini_image", image)
    monkeypatch.setattr(voice_service, "call_gemini_audio", audio)
    response = await transactional_client.post(f"{BASE}/{mode}-preview", content=body,
        headers={**auth_headers(1), "Content-Type": mime})
    assert response.status_code == status
    image.assert_not_awaited(); audio.assert_not_awaited()


@pytest.mark.parametrize("user_id,status", [(1, 200), (2, 200), (3, 403)])
async def test_storage_entry_context_is_scoped(transactional_client, user_id, status):
    response = await transactional_client.get('/api/v1/storage-boxes/100', headers=auth_headers(user_id))
    assert response.status_code == status
    if status == 200:
        assert response.json()["refrigerator_id"] == 10


async def test_membership_removed_while_waiting_for_lock_cannot_save(
    transactional_client, inventory_sessions, monkeypatch,
):
    from app.api.v1 import ingredient_import
    reached, resume = asyncio.Event(), asyncio.Event()
    original = ingredient_import.lock_refrigerator

    async def wait_for_removal(*args):
        reached.set()
        await asyncio.wait_for(resume.wait(), 5)
        return await original(*args)

    monkeypatch.setattr(ingredient_import, "lock_refrigerator", wait_for_removal)
    before = await snapshot(inventory_sessions)
    request = asyncio.create_task(transactional_client.post(f"{BASE}/batch", json={"items": ITEMS}, headers=auth_headers(2)))
    try:
        await asyncio.wait_for(reached.wait(), 5)
        async with inventory_sessions.begin() as db:
            await db.execute(delete(RefrigeratorMember).where(RefrigeratorMember.user_id == 2))
        resume.set()
        response = await asyncio.wait_for(request, 5)
        assert response.status_code == 403
        assert await snapshot(inventory_sessions) == before
    finally:
        resume.set()
        if not request.done():
            request.cancel()
            await asyncio.gather(request, return_exceptions=True)
