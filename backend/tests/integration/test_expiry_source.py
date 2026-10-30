import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import inspect

from tests.integration.test_consume_dispose import auth_headers, inventory_sessions, snapshot, transactional_client
from tests.integration.test_cooking import ai, recommend, preview, payload, consume

URL = '/api/v1/storage-boxes/100/ingredients'


@pytest.mark.parametrize('source,day', [('estimated', '2026-12-01'), ('label', '2026-12-02'), ('unknown', None), ('untracked', None)])
async def test_source_roundtrip_history_and_dashboard(transactional_client, inventory_sessions, source, day):
    response = await transactional_client.post(URL, headers=auth_headers(2), json={
        'name': '당근', 'quantity': 2, 'unit': '개', 'expiry_date': day, 'expiry_source': source,
    })
    assert response.status_code == 201
    item = response.json()
    assert item['expiry_source'] == source and item['expiry_date'] == day
    listed = await transactional_client.get(URL, headers=auth_headers(1))
    assert item in listed.json()
    assert (await transactional_client.post(f"{URL}/{item['id']}/dispose", headers=auth_headers(2), json={})).status_code == 204
    state = await snapshot(inventory_sessions)
    assert state['logs'][-1]['expiry_source'] == source
    activity = (await transactional_client.get('/api/v1/activity', headers=auth_headers(2))).json()
    assert activity['items'][0]['expiry_source'] == source


@pytest.mark.parametrize('data', [
    {'expiry_source': 'estimated'}, {'expiry_source': 'label'},
    {'expiry_source': 'untracked', 'expiry_date': '2026-12-01'}, {'expiry_source': 'infinite'},
])
async def test_invalid_source_date_pair_rejected(transactional_client, inventory_sessions, data):
    before = await snapshot(inventory_sessions)
    assert (await transactional_client.post(URL, headers=auth_headers(1), json={'name': '우유', **data})).status_code == 422
    assert await snapshot(inventory_sessions) == before


async def test_edit_preserves_origin_and_old_client_date_edit_relabels(transactional_client):
    item_url = URL + '/1000'
    r = await transactional_client.put(item_url, headers=auth_headers(1), json={'expiry_source': 'estimated'})
    assert r.status_code == 200 and r.json()['expiry_source'] == 'estimated'
    r = await transactional_client.put(item_url, headers=auth_headers(1), json={'name': '당근 수정'})
    assert r.json()['expiry_source'] == 'estimated' and r.json()['expiry_date'] == '2026-12-31'
    r = await transactional_client.put(item_url, headers=auth_headers(1), json={'expiry_date': '2026-12-10'})
    assert r.json()['expiry_source'] == 'label'
    assert (await transactional_client.put(item_url, headers=auth_headers(1), json={'expiry_source': 'untracked'})).status_code == 422
    r = await transactional_client.put(item_url, headers=auth_headers(1), json={'expiry_date': None})
    assert r.json()['expiry_source'] == 'unknown'


async def test_distributed_save_and_bulk_disposal_preserve_sources(transactional_client, inventory_sessions):
    response = await transactional_client.post('/api/v1/refrigerators/10/ingredients/batch', headers=auth_headers(1), json={'items': [
        {'storage_box_id': 100, 'name': '브로콜리', 'quantity': 1, 'expiry_date': '2026-12-01', 'expiry_source': 'estimated'},
        {'storage_box_id': 100, 'name': '소금', 'quantity': 1, 'expiry_date': None, 'expiry_source': 'untracked'},
    ]})
    assert response.status_code == 201
    items = [{k: v for k, v in item.items() if k != 'storage_box_id'} for item in response.json()]
    response = await transactional_client.post(URL + '/bulk-action', headers=auth_headers(2), json={'action': 'dispose', 'items': items})
    assert response.status_code == 204
    logs = (await snapshot(inventory_sessions))['logs'][-2:]
    assert [log['expiry_source'] for log in logs] == ['estimated', 'untracked']


async def test_source_change_blocks_stale_bulk_and_cooking(transactional_client, inventory_sessions, ai):
    plan = await recommend(transactional_client)
    cooking = payload(await preview(transactional_client, plan))
    item = (await transactional_client.get(URL, headers=auth_headers(1))).json()[0]
    item.pop('storage_box_id')
    assert (await transactional_client.put(URL + '/1000', headers=auth_headers(2), json={'expiry_source': 'estimated'})).status_code == 200
    before = await snapshot(inventory_sessions)
    assert (await transactional_client.post(URL + '/bulk-action', headers=auth_headers(1), json={'action': 'dispose', 'items': [item]})).status_code == 409
    assert (await consume(transactional_client, plan, cooking)).status_code == 409
    assert await snapshot(inventory_sessions) == before


async def test_cooking_log_keeps_estimated_origin(transactional_client, inventory_sessions, ai):
    await transactional_client.put(URL + '/1000', headers=auth_headers(1), json={'expiry_source': 'estimated'})
    plan = await recommend(transactional_client)
    assert (await consume(transactional_client, plan, payload(await preview(transactional_client, plan)))).status_code == 200
    assert (await snapshot(inventory_sessions))['logs'][-1]['expiry_source'] == 'estimated'


async def test_migration_preserves_existing_dates_and_history(inventory_sessions, test_engine):
    before = await snapshot(inventory_sessions)
    spec = importlib.util.spec_from_file_location('expiry_migration', Path(__file__).parents[2] / 'alembic/versions/e4a817c2b590_add_expiry_source.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    def run(conn):
        with Operations.context(MigrationContext.configure(conn)):
            module.downgrade()
            for table in ('ingredients', 'ingredient_logs'):
                assert 'expiry_source' not in {col['name'] for col in inspect(conn).get_columns(table)}
            module.upgrade()
    async with test_engine.begin() as db:
        await db.run_sync(run)
    assert await snapshot(inventory_sessions) == before
