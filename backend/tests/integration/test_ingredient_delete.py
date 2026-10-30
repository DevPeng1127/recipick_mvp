import asyncio
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.refrigerator import RefrigeratorMember
from tests.integration.test_consume_dispose import (
    auth_headers, inventory_sessions, snapshot, transactional_client,
)
from tests.integration.test_cooking import ai, recommend, preview, payload, consume

URL = '/api/v1/storage-boxes/100/ingredients/1000'


@pytest.mark.parametrize('user_id', [1, 2], ids=['owner', 'guest'])
async def test_delete_removes_only_selected_stock_without_creating_history(
    transactional_client, inventory_sessions, user_id,
):
    before = await snapshot(inventory_sessions)
    response = await transactional_client.delete(URL, headers=auth_headers(user_id))
    assert response.status_code == 204 and not response.content
    after = await snapshot(inventory_sessions)
    assert after['ingredients'] == [row for row in before['ingredients'] if row['id'] != 1000]
    assert after['logs'] == before['logs']
    listed = await transactional_client.get('/api/v1/storage-boxes/100/ingredients', headers=auth_headers(2))
    assert listed.json() == []


async def test_previous_consumption_disposal_and_dashboard_are_preserved(transactional_client, inventory_sessions):
    for action in ['consume', 'dispose']:
        response = await transactional_client.post(URL + '/' + action, headers=auth_headers(2), json={'quantity': .5})
        assert response.status_code == 200
    before = await snapshot(inventory_sessions)
    dashboard = await transactional_client.get('/api/v1/activity', headers=auth_headers(2), params={'refrigerator_id': 10})
    assert dashboard.status_code == 200
    assert dashboard.json()['counts']['disposed'] >= 1
    assert (await transactional_client.delete(URL, headers=auth_headers(1))).status_code == 204
    after = await snapshot(inventory_sessions)
    assert after['logs'] == before['logs']
    latest = await transactional_client.get('/api/v1/activity', headers=auth_headers(2), params={'refrigerator_id': 10})
    for field in ['counts', 'daily', 'frequent_disposals', 'items']:
        assert latest.json()[field] == dashboard.json()[field]


async def test_repeated_and_simultaneous_deletes_are_safe(transactional_client, inventory_sessions):
    before = await snapshot(inventory_sessions)
    responses = await asyncio.gather(*[
        transactional_client.delete(URL, headers=auth_headers(user_id)) for user_id in [1, 2, 1]
    ])
    assert [response.status_code for response in responses] == [204, 204, 204]
    assert (await transactional_client.delete(URL, headers=auth_headers(2))).status_code == 204
    after = await snapshot(inventory_sessions)
    assert after['ingredients'] == [row for row in before['ingredients'] if row['id'] != 1000]
    assert after['logs'] == before['logs']


@pytest.mark.parametrize('ingredient_id', [2000, 999999])
async def test_missing_or_other_box_id_never_deletes_other_stock(transactional_client, inventory_sessions, ingredient_id):
    before = await snapshot(inventory_sessions)
    response = await transactional_client.delete(f'/api/v1/storage-boxes/100/ingredients/{ingredient_id}', headers=auth_headers(1))
    assert response.status_code == 204
    assert await snapshot(inventory_sessions) == before


@pytest.mark.parametrize('user_id', [None, 3])
async def test_unauthorized_delete_changes_nothing(transactional_client, inventory_sessions, user_id):
    before = await snapshot(inventory_sessions)
    response = await transactional_client.delete(URL, headers=auth_headers(user_id) if user_id else {})
    assert response.status_code in (401, 403)
    assert await snapshot(inventory_sessions) == before


async def test_commit_failure_never_reports_success_and_rolls_back(transactional_client, inventory_sessions, monkeypatch):
    before = await snapshot(inventory_sessions)
    monkeypatch.setattr(AsyncSession, 'commit', AsyncMock(side_effect=RuntimeError('test commit failure')))
    response = await transactional_client.delete(URL, headers=auth_headers(1))
    assert response.status_code == 500
    assert await snapshot(inventory_sessions) == before


@pytest.mark.parametrize('action', ['consume', 'dispose'])
async def test_delete_racing_with_usage_keeps_only_actual_usage_history(transactional_client, inventory_sessions, action):
    before = await snapshot(inventory_sessions)
    deleted, used = await asyncio.gather(
        transactional_client.delete(URL, headers=auth_headers(2)),
        transactional_client.post(URL + '/' + action, headers=auth_headers(1), json={'quantity': .5}),
    )
    assert deleted.status_code == 204
    assert used.status_code in (200, 404)
    after = await snapshot(inventory_sessions)
    assert after['ingredients'] == [row for row in before['ingredients'] if row['id'] != 1000]
    assert len(after['logs']) == len(before['logs']) + (1 if used.status_code == 200 else 0)
    assert after['logs'][:len(before['logs'])] == before['logs']
    if used.status_code == 200:
        assert after['logs'][-1]['quantity'] == .5


async def test_deleting_planned_ingredient_blocks_stale_smart_deduction(transactional_client, inventory_sessions, ai):
    plan_id = await recommend(transactional_client)
    body = payload(await preview(transactional_client, plan_id))
    assert (await transactional_client.delete(URL, headers=auth_headers(2))).status_code == 204
    before = await snapshot(inventory_sessions)
    response = await consume(transactional_client, plan_id, body)
    assert response.status_code == 409
    assert response.json()['detail']['code'] == 'inventory_changed'
    assert await snapshot(inventory_sessions) == before


async def test_removed_member_cannot_delete_after_waiting_for_fridge_lock(
    transactional_client, inventory_sessions, monkeypatch,
):
    from app.api.v1 import ingredients
    reached, resume = asyncio.Event(), asyncio.Event()
    original = ingredients.lock_refrigerator

    async def wait_for_removal(*args):
        reached.set()
        await asyncio.wait_for(resume.wait(), 5)
        return await original(*args)

    monkeypatch.setattr(ingredients, 'lock_refrigerator', wait_for_removal)
    before = await snapshot(inventory_sessions)
    pending = asyncio.create_task(transactional_client.delete(URL, headers=auth_headers(2)))
    try:
        await asyncio.wait_for(reached.wait(), 5)
        async with inventory_sessions.begin() as db:
            await db.execute(delete(RefrigeratorMember).where(RefrigeratorMember.user_id == 2))
        resume.set()
        response = await asyncio.wait_for(pending, 5)
        assert response.status_code == 403
        assert await snapshot(inventory_sessions) == before
    finally:
        resume.set()
        if not pending.done():
            pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)
