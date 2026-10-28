"""Sharing uses real request transactions and an isolated PostgreSQL schema."""
import asyncio
import hashlib
import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import delete, func, inspect, select

from app.models.invitation import RefrigeratorInvitation
from app.models.refrigerator import RefrigeratorMember
from tests.integration.test_consume_dispose import (
    auth_headers, inventory_sessions, snapshot, transactional_client,  # noqa: F401
)

FRIDGE = "/api/v1/refrigerators/10"
INVITES = FRIDGE + "/invitations"
INGREDIENTS = "/api/v1/storage-boxes/100/ingredients"


async def create(client):
    response = await client.post(INVITES, headers=auth_headers(1))
    assert response.status_code == 201, response.text
    invite = response.json()
    return invite, invite["url"].split("#")[1]


async def accept(client, token, user_id=3):
    return await client.post("/api/v1/invitations/accept", json={"token": token}, headers=auth_headers(user_id))


async def test_invitation_preview_accept_and_digest_storage(transactional_client, inventory_sessions):
    client = transactional_client
    invite, token = await create(client)
    assert len(token) == 43
    assert datetime.fromisoformat(invite["expires_at"]) - datetime.fromisoformat(invite["created_at"]) == timedelta(hours=24)
    async with inventory_sessions() as db:
        row = await db.get(RefrigeratorInvitation, invite["id"])
        assert row.token_hash == hashlib.sha256(token.encode()).hexdigest()
        assert token not in str(row.__dict__)
    preview = await client.post("/api/v1/invitations/preview", json={"token": token}, headers=auth_headers(3))
    assert preview.status_code == 200
    assert preview.json()["refrigerator_name"] == "우리 냉장고"
    assert preview.json()["already_member"] is False
    assert (await client.get(FRIDGE, headers=auth_headers(3))).status_code == 403
    assert (await accept(client, token)).json() == {"refrigerator_id": 10, "already_member": False}
    detail = (await client.get(FRIDGE, headers=auth_headers(3))).json()
    assert detail["role"] == "GUEST"
    assert len(detail["members"]) == 3
    assert all(m["nickname"] for m in detail["members"])
    assert (await accept(client, token)).json()["already_member"] is True
    invitations = (await client.get(INVITES, headers=auth_headers(1))).json()
    assert invitations[0]["status"] == "used"
    assert "url" not in invitations[0] and "token_hash" not in invitations[0]


async def test_existing_member_does_not_consume_link(transactional_client):
    _, token = await create(transactional_client)
    assert (await accept(transactional_client, token, 2)).json()["already_member"] is True
    assert (await accept(transactional_client, token, 3)).status_code == 200


@pytest.mark.parametrize("kind", ["revoked", "expired", "unknown"])
async def test_unavailable_links_do_not_add_members(transactional_client, inventory_sessions, kind):
    invite, token = await create(transactional_client)
    if kind == "revoked":
        assert (await transactional_client.delete(f'{INVITES}/{invite["id"]}', headers=auth_headers(1))).status_code == 204
    elif kind == "expired":
        async with inventory_sessions.begin() as db:
            row = await db.get(RefrigeratorInvitation, invite["id"])
            row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    else:
        token = "x" * 43
    for operation in ["preview", "accept"]:
        response = await transactional_client.post(f"/api/v1/invitations/{operation}", json={"token": token}, headers=auth_headers(3))
        assert response.status_code == 410
    assert (await transactional_client.get(FRIDGE, headers=auth_headers(3))).status_code == 403


@pytest.mark.parametrize("method,path,body", [
    ("POST", INVITES, None), ("GET", INVITES, None),
    ("DELETE", INVITES + "/1", None), ("DELETE", FRIDGE + "/members/1", None),
    ("PUT", FRIDGE, {"name": "changed"}), ("DELETE", FRIDGE, None),
    ("POST", FRIDGE + "/storage-boxes", {"name": "x", "type": "FRIDGE"}),
    ("PUT", FRIDGE + "/storage-boxes/100", {"name": "x"}),
    ("DELETE", FRIDGE + "/storage-boxes/100", None),
    ("PUT", FRIDGE + "/storage-boxes/reorder", {"ordered_ids": [100]}),
])
async def test_guest_cannot_manage_structure_or_members(transactional_client, inventory_sessions, method, path, body):
    before = await snapshot(inventory_sessions)
    response = await transactional_client.request(method, path, json=body, headers=auth_headers(2))
    assert response.status_code == 403, response.text
    assert before == await snapshot(inventory_sessions)


async def test_joined_guest_shared_crud_and_leave_preserve_history(transactional_client, inventory_sessions):
    client = transactional_client
    _, token = await create(client)
    await accept(client, token)
    response = await client.post(INGREDIENTS, headers=auth_headers(3), json={"name": "공유 우유", "quantity": 4, "unit": "팩"})
    assert response.status_code == 201
    item = response.json()["id"]
    assert any(i["id"] == item for i in (await client.get(INGREDIENTS, headers=auth_headers(1))).json())
    assert (await client.put(f"{INGREDIENTS}/{item}", headers=auth_headers(3), json={"quantity": 5})).status_code == 200
    assert (await client.post(f"{INGREDIENTS}/{item}/consume", headers=auth_headers(3), json={"quantity": 1})).status_code == 200
    assert (await client.post(f"{INGREDIENTS}/{item}/dispose", headers=auth_headers(3), json={"quantity": 1})).status_code == 200
    assert (await client.post(f"{INGREDIENTS}/{item}/consume", headers=auth_headers(3))).status_code == 204
    before = await snapshot(inventory_sessions)
    assert before["logs"][-1]["user_id"] == 3
    assert (await client.delete(FRIDGE + "/members/me", headers=auth_headers(3))).status_code == 204
    assert before == await snapshot(inventory_sessions)
    assert (await client.get(INGREDIENTS, headers=auth_headers(3))).status_code == 403
    assert (await accept(client, token)).status_code == 410
    _, fresh = await create(client)
    assert (await accept(client, fresh)).status_code == 200


async def test_remove_member_preserves_data_and_blocks_all_entrypoints(transactional_client, inventory_sessions):
    client = transactional_client
    _, token = await create(client)
    await accept(client, token)
    before = await snapshot(inventory_sessions)
    assert (await client.delete(FRIDGE + "/members/3", headers=auth_headers(1))).status_code == 204
    assert before == await snapshot(inventory_sessions)
    for path in [FRIDGE, FRIDGE + "/members", FRIDGE + "/storage-boxes", INGREDIENTS]:
        assert (await client.get(path, headers=auth_headers(3))).status_code == 403
    assert (await client.post(INGREDIENTS, headers=auth_headers(3), json={"name": "x"})).status_code == 403
    assert (await accept(client, token)).status_code == 410
    rows = (await client.get("/api/v1/refrigerators", headers=auth_headers(3))).json()
    assert all(row["id"] != 10 for row in rows)
    search = (await client.get("/api/v1/ingredients/search?q=당근", headers=auth_headers(3))).json()
    assert search == []


@pytest.mark.parametrize("path", ["/members/me", "/members/1"])
async def test_owner_cannot_leave_or_be_removed(transactional_client, path):
    assert (await transactional_client.delete(FRIDGE + path, headers=auth_headers(1))).status_code == 403


async def test_link_requires_auth_and_valid_token(transactional_client):
    _, token = await create(transactional_client)
    assert (await transactional_client.post("/api/v1/invitations/preview", json={"token": token})).status_code in (401, 403)
    assert (await accept(transactional_client, "bad")).status_code == 422


async def test_one_link_concurrent_two_users_only_one_joins(transactional_client, inventory_sessions):
    async with inventory_sessions.begin() as db:
        await db.execute(delete(RefrigeratorMember).where(RefrigeratorMember.user_id == 2))
    _, token = await create(transactional_client)
    responses = await asyncio.gather(accept(transactional_client, token, 2), accept(transactional_client, token, 3))
    assert sorted(r.status_code for r in responses) == [200, 410]
    async with inventory_sessions() as db:
        assert await db.scalar(select(func.count()).select_from(RefrigeratorMember).where(RefrigeratorMember.refrigerator_id == 10)) == 2


async def test_different_links_concurrent_same_user_join_is_idempotent(transactional_client, inventory_sessions):
    _, first = await create(transactional_client)
    _, second = await create(transactional_client)
    responses = await asyncio.gather(accept(transactional_client, first), accept(transactional_client, second))
    assert [r.status_code for r in responses] == [200, 200]
    assert sorted(r.json()["already_member"] for r in responses) == [False, True]
    async with inventory_sessions() as db:
        assert await db.scalar(select(func.count()).select_from(RefrigeratorInvitation).where(RefrigeratorInvitation.accepted_at.is_not(None))) == 1


async def test_invitation_migration_round_trip_preserves_existing_data(inventory_sessions, test_engine):
    before = await snapshot(inventory_sessions)
    path = Path(__file__).parents[2] / "alembic/versions/c901e58a3f62_add_refrigerator_invitations.py"
    spec = importlib.util.spec_from_file_location("invitation_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    def run(conn):
        with Operations.context(MigrationContext.configure(conn)):
            module.downgrade()
            assert not inspect(conn).has_table("refrigerator_invitations")
            module.upgrade()
            assert inspect(conn).has_table("refrigerator_invitations")
            assert inspect(conn).get_unique_constraints("refrigerator_invitations")[0]["column_names"] == ["token_hash"]
    async with test_engine.begin() as conn:
        await conn.run_sync(run)
    assert before == await snapshot(inventory_sessions)
