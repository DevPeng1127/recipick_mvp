from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.services.recipe_usage import RecipeRateLimitError, check_limits, day_bounds

NOW = datetime(2026, 10, 19, 12, tzinfo=timezone.utc)


def attempt(user_id=1, started_at=NOW, active=False):
    return SimpleNamespace(
        user_id=user_id, started_at=started_at,
        lease_expires_at=started_at + timedelta(seconds=90),
        finished_at=None if active else started_at,
    )


def test_user_rolling_minute_returns_exact_next_slot():
    rows = [attempt(started_at=NOW - timedelta(seconds=n)) for n in (59, 30, 5)]
    with pytest.raises(RecipeRateLimitError) as error:
        check_limits(rows, 1, NOW)
    assert error.value.code == "user_minute_limit"
    assert error.value.retry_after_seconds == 1
    check_limits(rows, 1, NOW + timedelta(seconds=1))


def test_shared_minute_limit_combines_users():
    rows = [attempt(user_id=n, started_at=NOW - timedelta(seconds=20)) for n in range(12)]
    with pytest.raises(RecipeRateLimitError) as error:
        check_limits(rows, 99, NOW)
    assert error.value.code == "app_minute_limit"
    assert error.value.retry_after_seconds == 40


@pytest.mark.parametrize("user_id,count,code,zone", [
    (1, 20, "user_daily_limit", "Asia/Seoul"),
    (2, 400, "app_daily_limit", "America/Los_Angeles"),
])
def test_daily_limits_reset_at_their_own_midnight(user_id, count, code, zone):
    start, end = day_bounds(NOW, zone)
    rows = [attempt(user_id=user_id, started_at=start + timedelta(seconds=n)) for n in range(count)]
    with pytest.raises(RecipeRateLimitError) as error:
        check_limits(rows, 1, NOW)
    assert error.value.code == code
    assert error.value.retry_at == end
    check_limits(rows, 1, end)


def test_strictest_limit_determines_retry_time():
    rows = [attempt(started_at=NOW - timedelta(minutes=n)) for n in range(20)]
    rows.extend(attempt(user_id=2, started_at=NOW) for _ in range(12))
    with pytest.raises(RecipeRateLimitError) as error:
        check_limits(rows, 1, NOW)
    assert error.value.code == "user_daily_limit"
    assert error.value.retry_at == day_bounds(NOW, "Asia/Seoul")[1]


def test_active_request_blocks_only_same_account():
    rows = [attempt(active=True)]
    with pytest.raises(RecipeRateLimitError) as error:
        check_limits(rows, 1, NOW)
    assert error.value.code == "user_request_in_progress"
    assert error.value.retry_at is None
    check_limits(rows, 2, NOW)
    check_limits(rows, 1, NOW + timedelta(seconds=90))


@pytest.mark.parametrize("day,hours,start_hour,end_hour", [
    (datetime(2026, 3, 8, 12, tzinfo=timezone.utc), 23, 8, 7),
    (datetime(2026, 11, 1, 12, tzinfo=timezone.utc), 25, 7, 8),
])
def test_pacific_reset_observes_daylight_saving(day, hours, start_hour, end_hour):
    start, end = day_bounds(day, "America/Los_Angeles")
    assert (end - start).total_seconds() == hours * 3600
    assert start.hour == start_hour
    assert end.hour == end_hour


def test_seoul_reset_is_utc_1500():
    start, end = day_bounds(NOW, "Asia/Seoul")
    assert start == datetime(2026, 10, 18, 15, tzinfo=timezone.utc)
    assert end == datetime(2026, 10, 19, 15, tzinfo=timezone.utc)


def test_minute_window_survives_midnight_reset():
    midnight = day_bounds(NOW, "America/Los_Angeles")[1]
    rows = [attempt(user_id=n, started_at=midnight - timedelta(seconds=10)) for n in range(12)]
    with pytest.raises(RecipeRateLimitError) as error:
        check_limits(rows, 99, midnight)
    assert error.value.code == "app_minute_limit"
    assert error.value.retry_after_seconds == 50
