import asyncio
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1 import ingredients as routes
from app.models.ingredient import Ingredient
from app.models.ingredient_log import ActionType
from app.models.refrigerator import RefrigeratorMember
from tests.integration.test_consume_dispose import (
    auth_headers, inventory_sessions, snapshot, transactional_client,
)

URL = '/api/v1/storage-boxes/100/ingredients/bulk-action'


@pytest.fixture(autouse=True)
async def more_stock(inventory_sessions):
    async with inventory_sessions.begin() as db:
        db.add_all([
            Ingredient(id=1001, storage_box_id=100, name='우유', quantity=2, unit='팩'),
            Ingredient(id=1002, storage_box_id=100, name='남겨 둘 재료', quantity=3, unit='개'),
        ])


def body(action='dispose'):
    return {'action': action, 'memo': '  냉장고 정리  ', 'items': [
        {'id': 1000, 'name': '당근', 'quantity': 5.5, 'unit': 'kg', 'expiry_date': '2026-12-31'},
        {'id': 1001, 'name': '우유', 'quantity': 2, 'unit': '팩', 'expiry_date': None},
    ]}


@pytest.mark.parametrize('action', ['delete', 'dispose'])
@pytest.mark.parametrize('user_id', [1, 2])
async def test_bulk_owner_and_family_exact_stock_history_and_stats(transactional_client, inventory_sessions, action, user_id):
    before = await snapshot(inventory_sessions)
    activity_before = (await transactional_client.get('/api/v1/activity', headers=auth_headers(user_id), params={'refrigerator_id': 10})).json()
    response = await transactional_client.post(URL, headers=auth_headers(user_id), json=body(action))
    assert response.status_code == 204 and not response.content
    after = await snapshot(inventory_sessions)
    assert after['ingredients'] == [row for row in before['ingredients'] if row['id'] not in (1000, 1001)]
    assert after['logs'][:len(before['logs'])] == before['logs']
    logs = after['logs'][len(before['logs']):]
    assert len(logs) == (2 if action == 'dispose' else 0)
    for log, original in zip(logs, before['ingredients'][:2]):
        assert log['ingredient_id'] == original['id']
        assert log['ingredient_name'] == original['name']
        for field in ('quantity', 'unit', 'expiry_date'):
            assert log[field] == original[field]
        assert log['user_id'] == user_id and log['action_type'] == ActionType.DISPOSED
        assert log['memo'] == '냉장고 정리' and log['refrigerator_id'] == 10
    activity_after = (await transactional_client.get('/api/v1/activity', headers=auth_headers(user_id), params={'refrigerator_id': 10})).json()
    assert activity_after['counts']['disposed'] == activity_before['counts']['disposed'] + len(logs)
    if action == 'delete':
        for field in ['counts', 'daily', 'frequent_disposals', 'items']:
            assert activity_after[field] == activity_before[field]
    listed = await transactional_client.get('/api/v1/storage-boxes/100/ingredients', headers=auth_headers(2))
    assert [item['id'] for item in listed.json()] == [1002]


@pytest.mark.parametrize('action', ['delete', 'dispose'])
@pytest.mark.parametrize('field,value', [
    ('id', 2000), ('id', 99999), ('quantity', 1), ('name', '다른 이름'),
    ('unit', '병'), ('expiry_date', '2026-12-01'),
])
async def test_one_foreign_missing_or_changed_target_rejects_everything(transactional_client, inventory_sessions, action, field, value):
    data = body(action)
    data['items'][1][field] = value
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(URL, headers=auth_headers(1), json=data)
    assert response.status_code == 409
    assert response.json()['detail']['code'] == 'inventory_changed'
    assert await snapshot(inventory_sessions) == before


@pytest.mark.parametrize('action', ['delete', 'dispose'])
async def test_duplicate_concurrent_and_repeated_requests_never_repeat_history(transactional_client, inventory_sessions, action):
    before = await snapshot(inventory_sessions)
    responses = await asyncio.gather(*[
        transactional_client.post(URL, headers=auth_headers(i), json=body(action)) for i in (1, 2)
    ])
    assert sorted(response.status_code for response in responses) == [204, 409]
    after = await snapshot(inventory_sessions)
    assert len(after['logs']) == len(before['logs']) + (2 if action == 'dispose' else 0)
    assert (await transactional_client.post(URL, headers=auth_headers(1), json=body(action))).status_code == 409
    assert await snapshot(inventory_sessions) == after


@pytest.mark.parametrize('action', ['delete', 'dispose'])
@pytest.mark.parametrize('commit_failure', [False, True])
async def test_failure_after_writes_rolls_back_whole_batch(transactional_client, inventory_sessions, action, commit_failure, monkeypatch):
    before = await snapshot(inventory_sessions)
    if commit_failure:
        monkeypatch.setattr(AsyncSession, 'commit', AsyncMock(side_effect=RuntimeError('commit failure')))
    else:
        original = routes.bulk_action_ingredients
        async def fail_after_writes(*args):
            await original(*args)
            raise RuntimeError('failure after flush')
        monkeypatch.setattr(routes, 'bulk_action_ingredients', fail_after_writes)
    response = await transactional_client.post(URL, headers=auth_headers(1), json=body(action))
    assert response.status_code == 500
    assert await snapshot(inventory_sessions) == before


@pytest.mark.parametrize('action', ['delete', 'dispose'])
@pytest.mark.parametrize('user_id', [None, 3])
async def test_no_access_cannot_change_anything(transactional_client, inventory_sessions, action, user_id):
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(URL, headers=auth_headers(user_id) if user_id else {}, json=body(action))
    assert response.status_code == (403 if user_id else 401)
    assert await snapshot(inventory_sessions) == before


@pytest.mark.parametrize('invalid', ['empty', 'duplicates', 'too-many', 'action', 'quantity', 'memo', 'id'])
async def test_invalid_body_never_changes_inventory(transactional_client, inventory_sessions, invalid):
    data = body()
    if invalid == 'empty': data['items'] = []
    elif invalid == 'duplicates': data['items'].append(data['items'][0])
    elif invalid == 'too-many': data['items'] = [{**data['items'][0], 'id': i + 1} for i in range(101)]
    elif invalid == 'action': data['action'] = 'consume'
    elif invalid == 'quantity': data['items'][0]['quantity'] = 0
    elif invalid == 'memo': data['memo'] = 'x' * 501
    elif invalid == 'id': data['items'][0]['id'] = True
    before = await snapshot(inventory_sessions)
    assert (await transactional_client.post(URL, headers=auth_headers(1), json=data)).status_code == 422
    assert await snapshot(inventory_sessions) == before


@pytest.mark.parametrize('action', ['delete', 'dispose'])
async def test_consumption_while_waiting_for_item_lock_rejects_stale_batch(transactional_client, inventory_sessions, action):
    # Hold a real row lock while the batch is in flight, then change stock.
    async with inventory_sessions() as db:
        await db.execute(update(Ingredient).where(Ingredient.id == 1000).values(quantity=4))
        pending = asyncio.create_task(transactional_client.post(URL, headers=auth_headers(2), json=body(action)))
        await asyncio.sleep(.05)
        await db.commit()
        response = await asyncio.wait_for(pending, 5)
    assert response.status_code == 409
    state = await snapshot(inventory_sessions)
    assert state['ingredients'][0]['quantity'] == 4
    assert len(state['ingredients']) == 4 and len(state['logs']) == 1


@pytest.mark.parametrize('action', ['delete', 'dispose'])
async def test_membership_revoked_while_waiting_blocks_batch(transactional_client, inventory_sessions, action, monkeypatch):
    reached, resume = asyncio.Event(), asyncio.Event()
    original = routes.lock_refrigerator
    async def wait_for_removal(*args):
        reached.set()
        await asyncio.wait_for(resume.wait(), 5)
        return await original(*args)
    monkeypatch.setattr(routes, 'lock_refrigerator', wait_for_removal)
    before = await snapshot(inventory_sessions)
    pending = asyncio.create_task(transactional_client.post(URL, headers=auth_headers(2), json=body(action)))
    try:
        await asyncio.wait_for(reached.wait(), 5)
        async with inventory_sessions.begin() as db:
            await db.execute(delete(RefrigeratorMember).where(RefrigeratorMember.user_id == 2))
        resume.set()
        assert (await asyncio.wait_for(pending, 5)).status_code == 403
        assert await snapshot(inventory_sessions) == before
    finally:
        resume.set()
        if not pending.done():
            pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)
