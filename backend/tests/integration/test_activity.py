from datetime import datetime, time, timedelta, timezone
from unittest.mock import Mock

import pytest
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingredient_log import ActionType, IngredientLog
from app.models import ingredient_log
from app.models.refrigerator import Refrigerator, RefrigeratorMember
from app.services import activity_service
from tests.integration.test_consume_dispose import (
    auth_headers, inventory_sessions, snapshot, transactional_client,  # noqa: F401
)
from tests.integration.test_cooking import ai  # noqa: F401

NOW = datetime(2026, 10, 28, 15, 30, tzinfo=timezone.utc)  # Oct 29, 00:30 KST
START = datetime(2026, 9, 29, 15)


def log(name, *, user=1, fridge=10, action=ActionType.CONSUMED, at=None, quantity=1, unit='개', memo=None):
    return IngredientLog(user_id=user, refrigerator_id=fridge, refrigerator_name=f'냉장고 {fridge}',
        ingredient_id=999, ingredient_name=name, action_type=action, quantity=quantity, unit=unit,
        memo=memo, created_at=at or NOW.replace(tzinfo=None) - timedelta(minutes=10))


@pytest.fixture
async def history(inventory_sessions, monkeypatch):
    monkeypatch.setattr(activity_service, 'utc_now', lambda: NOW)
    async with inventory_sessions.begin() as db:
        await db.execute(delete(IngredientLog))
        db.add_all([Refrigerator(id=30, name='탈퇴한 냉장고'), Refrigerator(id=40, name='삭제할 냉장고')])
        await db.flush()
        db.add_all([
            log('시작 경계', at=START),
            log('내 폐기', action=ActionType.DISPOSED, at=datetime(2026, 10, 28, 14, 59), quantity=100, unit='g'),
            log('가족 폐기', user=2, action=ActionType.DISPOSED, at=datetime(2026, 10, 28, 15), memo='함께 보는 메모'),
            log('탈퇴 후 내 기록', fridge=30),
            log('삭제 후 내 기록', fridge=40, action=ActionType.DISPOSED),
            log('타인 비공개 기록', user=3, fridge=20),
            log('시작 직전', at=START - timedelta(microseconds=1)),
            log('미래 기록', at=NOW.replace(tzinfo=None) + timedelta(seconds=1)),
        ])
        await db.flush()
        await db.execute(delete(Refrigerator).where(Refrigerator.id == 40))


async def request(client, user=1, **params):
    return await client.get('/api/v1/activity', headers=auth_headers(user), params=params)


async def test_personal_summary_history_and_deleted_fridge(transactional_client, inventory_sessions, history):
    before = await snapshot(inventory_sessions)
    response = await request(transactional_client)
    assert response.status_code == 200, response.text
    assert response.headers['cache-control'] == 'no-store'
    data = response.json()
    assert data['scope'] == 'mine' and data['counts'] == dict(consumed=2, disposed=2, total=4)
    assert len(data['daily']) == 30
    assert data['start_date'] == '2026-09-30' and data['end_date'] == '2026-10-29'
    assert {x['ingredient_name'] for x in data['items']} == {'시작 경계', '내 폐기', '탈퇴 후 내 기록', '삭제 후 내 기록'}
    deleted = next(x for x in data['items'] if x['ingredient_name'] == '삭제 후 내 기록')
    assert deleted['refrigerator_id'] is None and deleted['refrigerator_name'] == '냉장고 40'
    assert all(x['is_mine'] and x['created_at'].endswith('Z') for x in data['items'])
    assert data['refrigerators'] == [{'id': 10, 'name': '우리 냉장고'}]
    assert before == await snapshot(inventory_sessions)


@pytest.mark.parametrize('user', [1, 2])
async def test_family_history_includes_other_members_past_records_and_memos(transactional_client, history, user):
    response = await request(transactional_client, user, refrigerator_id=10)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data['scope'] == 'refrigerator' and data['counts'] == dict(consumed=1, disposed=2, total=3)
    assert next(x for x in data['items'] if x['ingredient_name'] == '가족 폐기')['memo'] == '함께 보는 메모'
    assert {x['actor_name'] for x in data['items']} == {'소유자', '공유 멤버'}
    assert data['daily'][-1]['disposed'] == 1 and data['daily'][-2]['disposed'] == 1
    assert sum(x['consumed'] + x['disposed'] for x in data['daily']) == data['counts']['total']


@pytest.mark.parametrize('params,total', [({'days': 7}, 3), ({'days': 90}, 5),
    ({'action_type': 'CONSUMED'}, 2), ({'action_type': 'DISPOSED'}, 2)])
async def test_filters_apply_to_summary_chart_ranking_and_items(transactional_client, history, params, total):
    response = await request(transactional_client, **params)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data['counts']['total'] == total == len(data['items'])
    assert sum(x['consumed'] + x['disposed'] for x in data['daily']) == total
    if params.get('action_type') == 'CONSUMED':
        assert data['counts']['disposed'] == 0 and data['frequent_disposals'] == []


async def test_non_members_cannot_read_family_records(transactional_client, history):
    for user, fridge in [(3, 10), (1, 20), (1, 30), (1, 40), (1, 999)]:
        response = await request(transactional_client, user, refrigerator_id=fridge)
        assert response.status_code == 403
        assert 'items' not in response.json()


async def test_disposal_ranking_counts_operations_not_mixed_quantities(transactional_client, inventory_sessions, history):
    async with inventory_sessions.begin() as db:
        db.add_all([log('  당근  ', action=ActionType.DISPOSED, quantity=500, unit='g'),
                    log('당근', action=ActionType.DISPOSED, quantity=3, unit='개')])
        db.add_all([log(f'추가 {i}', action=ActionType.DISPOSED) for i in range(7)])
    data = (await request(transactional_client)).json()
    assert len(data['frequent_disposals']) == 5
    assert data['frequent_disposals'][0] == {'name': '당근', 'count': 2}
    assert data['counts']['disposed'] == 11


async def test_keyset_pages_have_no_duplicates_and_exclude_new_insertions(transactional_client, inventory_sessions, history):
    async with inventory_sessions.begin() as db:
        db.add_all([log(f'페이지 {i}') for i in range(45)])
    data = (await request(transactional_client)).json()
    assert len(data['items']) == 20 and data['next_cursor']
    seen = [x['id'] for x in data['items']]
    total = data['counts']['total']
    async with inventory_sessions.begin() as db:
        db.add(log('조회 도중 추가', at=NOW.replace(tzinfo=None) - timedelta(days=2)))
    while data['next_cursor']:
        response = await request(transactional_client, cursor=data['next_cursor'])
        assert response.status_code == 200, response.text
        data = response.json()
        assert data['counts']['total'] == total
        assert all(x['ingredient_name'] != '조회 도중 추가' for x in data['items'])
        seen += [x['id'] for x in data['items']]
    assert len(seen) == len(set(seen)) == total == 49
    assert (await request(transactional_client)).json()['counts']['total'] == 50


async def test_removed_member_cannot_use_old_cursor_but_keeps_personal_history(transactional_client, inventory_sessions, history):
    async with inventory_sessions.begin() as db:
        db.add_all([log(f'과거 가족 기록 {i}') for i in range(21)])
    data = (await request(transactional_client, 2, refrigerator_id=10)).json()
    assert data['next_cursor']
    async with inventory_sessions.begin() as db:
        await db.execute(delete(RefrigeratorMember).where(RefrigeratorMember.user_id == 2))
    response = await request(transactional_client, 2, refrigerator_id=10, cursor=data['next_cursor'])
    assert response.status_code == 403
    own = (await request(transactional_client, 2)).json()
    assert own['counts']['total'] == 1 and own['items'][0]['ingredient_name'] == '가족 폐기'
    assert own['refrigerators'] == []


async def test_read_snapshot_keeps_aggregates_and_rows_consistent_under_concurrent_change(transactional_client, inventory_sessions, history, monkeypatch):
    original = AsyncSession.execute
    changed = False
    async def execute(session, statement, *args, **kwargs):
        nonlocal changed
        result = await original(session, statement, *args, **kwargs)
        if not changed and 'count(*) FILTER' in str(statement) and 'GROUP BY' not in str(statement):
            changed = True
            async with inventory_sessions.begin() as other:
                await other.execute(update(IngredientLog).where(IngredientLog.ingredient_name == '시작 경계')
                    .values(action_type=ActionType.DISPOSED))
        return result
    monkeypatch.setattr(AsyncSession, 'execute', execute)
    data = (await request(transactional_client)).json()
    assert changed and data['counts'] == dict(consumed=2, disposed=2, total=4)
    assert next(x for x in data['items'] if x['ingredient_name'] == '시작 경계')['action_type'] == 'CONSUMED'
    assert sum(x['consumed'] for x in data['daily']) == 2
    assert (await request(transactional_client)).json()['counts']['disposed'] == 3


async def test_empty_history_still_returns_zero_filled_calendar(transactional_client, inventory_sessions, history):
    async with inventory_sessions.begin() as db:
        await db.execute(delete(IngredientLog))
    data = (await request(transactional_client, days=7)).json()
    assert data['counts'] == dict(consumed=0, disposed=0, total=0)
    assert len(data['daily']) == 7 and all(x['consumed'] == x['disposed'] == 0 for x in data['daily'])
    assert data['items'] == data['frequent_disposals'] == [] and data['next_cursor'] is None


@pytest.mark.parametrize('params', [{'days': 0}, {'days': 365}, {'days': 'oops'}, {'refrigerator_id': 0},
                                   {'refrigerator_id': -1}, {'action_type': 'BOUGHT'}, {'cursor': 'x' * 4097}])
async def test_invalid_parameters_are_rejected(transactional_client, history, params):
    assert (await request(transactional_client, **params)).status_code == 422


async def test_invalid_cursor_and_unauthenticated_requests_do_not_expose_records(transactional_client, history):
    assert (await request(transactional_client, cursor='invalid')).status_code == 400
    response = await transactional_client.get('/api/v1/activity')
    assert response.status_code in (401, 403) and 'items' not in response.json()


async def test_completed_smart_deduction_is_visible_as_consumption(transactional_client, inventory_sessions, ai):
    # Use the real clock for both saving and reading new logs. The fixed-date
    # history fixture is only for period-boundary tests, not fresh consumption.
    async with inventory_sessions.begin() as db:
        await db.execute(delete(IngredientLog))
    result = await transactional_client.post('/api/v1/recipes/recommend', headers=auth_headers(1),
        json={'refrigerator_ids': [10], 'servings': 1})
    assert result.status_code == 200
    id = result.json()['plan_id']
    preview = (await transactional_client.get(f'/api/v1/recipes/{id}/cooking', headers=auth_headers(1))).json()
    item = next(x for x in preview['stock'] if x['ingredient_id'] == 1000)
    result = await transactional_client.post(f'/api/v1/recipes/{id}/consume', headers=auth_headers(1),
        json={'items': [{'ingredient_id': 1000, 'quantity': .25, 'expected_token': item['token']}]})
    assert result.status_code == 200
    data = (await request(transactional_client)).json()
    saved = next(x for x in data['items'] if x['ingredient_name'] == '당근')
    assert saved['action_type'] == 'CONSUMED' and saved['quantity'] == .25 and saved['unit'] == 'kg'
    assert '당근 요리 (1인분)' in saved['memo'] and data['counts']['consumed'] == 1
    assert len(ai) == 1  # Dashboard does not make another AI request.


@pytest.mark.parametrize('days', [7, 30, 90])
@pytest.mark.parametrize('instant,korean_date', [
    ('2026-01-31T14:59:59.999999+00:00', '2026-01-31'),
    ('2026-01-31T15:00:00+00:00', '2026-02-01'),
    ('2026-12-31T14:59:59.999999+00:00', '2026-12-31'),
    ('2026-12-31T15:00:00+00:00', '2027-01-01'),
    ('2028-02-28T15:00:00+00:00', '2028-02-29'),
    ('2028-02-29T15:00:00+00:00', '2028-03-01'),
], ids=['month-end', 'month-start', 'year-end', 'year-start', 'leap-day', 'after-leap-day'])
async def test_new_and_existing_logs_follow_korean_period_boundaries(
    transactional_client, inventory_sessions, monkeypatch, days, instant, korean_date,
):
    now = datetime.fromisoformat(instant)
    end_date = datetime.fromisoformat(korean_date).date()
    start_date = end_date - timedelta(days=days - 1)
    # Build expected boundaries independently from activity_service.period().
    today_utc = datetime.combine(end_date, time.min) - timedelta(hours=9)
    start_utc = datetime.combine(start_date, time.min) - timedelta(hours=9)
    clock = Mock(wraps=datetime)
    clock.now.return_value = now
    monkeypatch.setattr(ingredient_log, 'datetime', clock)
    monkeypatch.setattr(activity_service, 'utc_now', lambda: now)
    async with inventory_sessions.begin() as db:
        await db.execute(delete(IngredientLog))
        db.add_all([
            log('기간 직전', at=start_utc - timedelta(microseconds=1)),
            log('기간 시작', at=start_utc),
            log('전날 끝', at=today_utc - timedelta(microseconds=1), action=ActionType.DISPOSED),
            log('오늘 시작', at=today_utc),
            log('조회 시각 이후', at=now.replace(tzinfo=None) + timedelta(microseconds=1)),
        ])

    # Exercise the new timestamp default through the real consumption API.
    saved = await transactional_client.post(
        '/api/v1/storage-boxes/100/ingredients/1000/consume', headers=auth_headers(1),
        json={'quantity': 0.25},
    )
    assert saved.status_code == 200, saved.text
    clock.now.assert_called_once_with(timezone.utc)

    expected = {'기간 시작': ActionType.CONSUMED, '오늘 시작': ActionType.CONSUMED,
                '당근': ActionType.CONSUMED, '전날 끝': ActionType.DISPOSED}
    for action in (None, ActionType.CONSUMED, ActionType.DISPOSED):
        params = {'days': days}
        if action:
            params['action_type'] = action.value
        response = await request(transactional_client, **params)
        assert response.status_code == 200, response.text
        data = response.json()
        assert data['start_date'] == start_date.isoformat()
        assert data['end_date'] == korean_date
        assert datetime.fromisoformat(data['as_of'].replace('Z', '+00:00')) == now
        assert len(data['daily']) == days
        assert data['daily'][0]['date'] == start_date.isoformat()
        assert data['daily'][-1]['date'] == korean_date
        names = {name for name, kind in expected.items() if action is None or kind == action}
        assert {item['ingredient_name'] for item in data['items']} == names
        consumed = 0 if action == ActionType.DISPOSED else 3
        disposed = 0 if action == ActionType.CONSUMED else 1
        assert data['counts'] == dict(consumed=consumed, disposed=disposed, total=len(names))
        assert sum(day['consumed'] for day in data['daily']) == consumed
        assert sum(day['disposed'] for day in data['daily']) == disposed
        assert data['daily'][0]['consumed'] == (1 if consumed else 0)
        assert data['daily'][-2]['disposed'] == disposed
        assert data['daily'][-1] == dict(date=korean_date, consumed=2 if consumed else 0, disposed=0)
        assert data['frequent_disposals'] == ([{'name': '전날 끝', 'count': 1}] if disposed else [])
        if consumed:
            fresh = next(item for item in data['items'] if item['ingredient_name'] == '당근')
            assert fresh['created_at'].endswith('Z')
            assert datetime.fromisoformat(fresh['created_at'].replace('Z', '+00:00')) == now
