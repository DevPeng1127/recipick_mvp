"""First-setup retries run against real, separately committed PostgreSQL requests."""
import asyncio

import pytest
from sqlalchemy import func, select

from app.models.refrigerator import MemberRole, Refrigerator, RefrigeratorMember
from app.models.user import User
from app.services import refrigerator_service
from tests.integration.test_consume_dispose import (
    auth_headers, inventory_sessions, snapshot, transactional_client,  # noqa: F401
)

URL = "/api/v1/refrigerators/initial"


@pytest.fixture
async def new_accounts(inventory_sessions):
    async with inventory_sessions.begin() as db:
        db.add_all([User(id=i, oauth_provider="kakao", oauth_id=f"new-{i}", nickname=f"새 회원 {i}")
                    for i in (4, 5)])


async def owned(sessions, user_id):
    async with sessions() as db:
        return list((await db.scalars(select(Refrigerator.id).join(RefrigeratorMember).where(
            RefrigeratorMember.user_id == user_id, RefrigeratorMember.role == MemberRole.OWNER
        ))).all())


async def test_concurrent_and_retried_setup_creates_one_fridge(transactional_client, inventory_sessions, new_accounts):
    responses = await asyncio.gather(*[
        transactional_client.post(URL, headers=auth_headers(4)) for _ in range(4)
    ])
    assert all(r.status_code == 200 for r in responses)
    ids = {r.json()["id"] for r in responses}
    assert len(ids) == 1
    assert responses[0].json()["name"] == "우리집 냉장고"
    assert responses[0].json()["role"] == "OWNER"
    assert await owned(inventory_sessions, 4) == list(ids)
    # Covers a client that lost the successful response and retries later.
    again = await transactional_client.post(URL, headers=auth_headers(4))
    assert again.json()["id"] in ids
    async with inventory_sessions() as db:
        assert await db.scalar(select(func.count()).select_from(RefrigeratorMember).where(
            RefrigeratorMember.user_id == 4)) == 1


async def test_reuses_existing_owned_fridge_without_renaming_or_touching_inventory(transactional_client, inventory_sessions):
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(URL, headers=auth_headers(1))
    assert response.status_code == 200
    assert (response.json()["id"], response.json()["name"]) == (10, "우리 냉장고")
    assert await owned(inventory_sessions, 1) == [10]
    assert await snapshot(inventory_sessions) == before


async def test_existing_multiple_fridges_are_not_deleted_and_manual_add_still_works(transactional_client, inventory_sessions):
    for _ in range(2):
        response = await transactional_client.post('/api/v1/refrigerators', headers=auth_headers(1), json={"name": "우리집 냉장고"})
        assert response.status_code == 201
    before = set(await owned(inventory_sessions, 1))
    assert len(before) == 3
    response = await transactional_client.post(URL, headers=auth_headers(1))
    assert response.status_code == 200 and response.json()["id"] in before
    assert set(await owned(inventory_sessions, 1)) == before


async def test_accounts_do_not_share_the_initial_fridge(transactional_client, inventory_sessions, new_accounts):
    results = await asyncio.gather(*[transactional_client.post(URL, headers=auth_headers(i)) for i in (4, 5)])
    assert all(r.status_code == 200 for r in results)
    assert results[0].json()["id"] != results[1].json()["id"]
    assert await owned(inventory_sessions, 4) == [results[0].json()["id"]]
    assert await owned(inventory_sessions, 5) == [results[1].json()["id"]]


async def test_guest_membership_is_not_mistaken_for_owned_fridge(transactional_client, inventory_sessions):
    response = await transactional_client.post(URL, headers=auth_headers(2))
    assert response.status_code == 200 and response.json()["id"] != 10
    assert await owned(inventory_sessions, 2) == [response.json()["id"]]
    async with inventory_sessions() as db:
        assert await db.scalar(select(RefrigeratorMember.role).where(
            RefrigeratorMember.user_id == 2, RefrigeratorMember.refrigerator_id == 10)) == MemberRole.GUEST


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer invalid"}, auth_headers(999)])
async def test_initial_creation_requires_a_real_authenticated_user(transactional_client, inventory_sessions, headers):
    async with inventory_sessions() as db:
        before = await db.scalar(select(func.count()).select_from(Refrigerator))
    assert (await transactional_client.post(URL, headers=headers)).status_code == 401
    async with inventory_sessions() as db:
        assert await db.scalar(select(func.count()).select_from(Refrigerator)) == before


async def test_failure_rolls_back_creation_and_retry_succeeds(transactional_client, inventory_sessions, new_accounts, monkeypatch):
    original = refrigerator_service.create_refrigerator

    async def fail_after_flush(*args):
        await original(*args)
        raise RuntimeError("simulated commit path failure")

    with monkeypatch.context() as patch:
        patch.setattr(refrigerator_service, "create_refrigerator", fail_after_flush)
        assert (await transactional_client.post(URL, headers=auth_headers(4))).status_code == 500
    assert await owned(inventory_sessions, 4) == []
    response = await transactional_client.post(URL, headers=auth_headers(4))
    assert response.status_code == 200
    assert await owned(inventory_sessions, 4) == [response.json()["id"]]
