from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.schemas.activity import ActivityPosition
from app.services.activity_service import period, read_cursor, write_cursor

NOW = datetime(2026, 10, 28, 15, 30, tzinfo=timezone.utc)
FILTERS = {'days': 30, 'refrigerator_id': None, 'action_type': None}


@pytest.mark.parametrize('days,start', [(7, '2026-10-23'), (30, '2026-09-30'), (90, '2026-08-01')])
def test_period_includes_today_in_korea(days, start):
    first, last, utc_start = period(NOW, days)
    assert first.isoformat() == start and last.isoformat() == '2026-10-29'
    assert utc_start.hour == 15 and utc_start.tzinfo is None
    assert (last - first).days + 1 == days


def token(user=1, filters=None, expires=None):
    return write_cursor(ActivityPosition(as_of=NOW, max_id=100, before_id=20,
        before_at=NOW - timedelta(minutes=1)), user, filters or FILTERS,
        expires if expires is not None else datetime.now(timezone.utc) + timedelta(hours=1))


def test_signed_cursor_preserves_position():
    position, expires = read_cursor(token(), 1, FILTERS)
    assert position.max_id == 100 and position.before_id == 20 and position.as_of == NOW
    assert expires > datetime.now(timezone.utc).timestamp()


@pytest.mark.parametrize('value', ['broken', '', 'a.b.c'])
def test_malformed_cursor_is_safe_400(value):
    with pytest.raises(HTTPException) as caught:
        read_cursor(value, 1, FILTERS)
    assert caught.value.status_code == 400
    assert value not in caught.value.detail if value else True


@pytest.mark.parametrize('change', [dict(days=7), dict(refrigerator_id=10), dict(action_type='DISPOSED')])
def test_cursor_cannot_be_reused_for_another_filter(change):
    with pytest.raises(HTTPException):
        read_cursor(token(), 1, {**FILTERS, **change})


def test_cursor_cannot_be_reused_by_another_user_or_after_expiry():
    for value in [token(user=2), token(expires=1)]:
        with pytest.raises(HTTPException):
            read_cursor(value, 1, FILTERS)


def test_cursor_tampering_is_rejected():
    value = token()
    parts = value.split('.')
    parts[1] = parts[1][:-2] + 'AA'
    with pytest.raises(HTTPException):
        read_cursor('.'.join(parts), 1, FILTERS)
