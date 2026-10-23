"""Opt-in PostgreSQL tests; create and remove only an isolated random schema."""
import asyncio
import importlib.util
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import func, inspect, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.recipe_usage import RecipeUsageAttempt
from app.services.recipe_usage import RecipeRateLimitError, RecipeUsageLimiter, day_bounds


def migration(connection, direction="upgrade"):
    path = Path(__file__).parents[2] / "alembic/versions/b84e1f920a63_add_recipe_usage_attempts.py"
    spec = importlib.util.spec_from_file_location("recipe_usage_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with Operations.context(MigrationContext.configure(connection)):
        getattr(module, direction)()


@pytest.fixture
async def usage_db(test_engine):
    async with test_engine.begin() as connection:
        await connection.run_sync(migration)
    factory = async_sessionmaker(test_engine, expire_on_commit=False)
    clock = SimpleNamespace(now=datetime(2026, 10, 19, 12, tzinfo=timezone.utc))
    limiter = RecipeUsageLimiter(factory, clock=lambda: clock.now)
    return SimpleNamespace(engine=test_engine, factory=factory, clock=clock, limiter=limiter)


async def rows(usage_db):
    async with usage_db.factory() as session:
        return (await session.execute(select(RecipeUsageAttempt))).scalars().all()


async def test_migration_upgrade_downgrade_and_index(usage_db):
    async with usage_db.engine.begin() as connection:
        indexes = await connection.run_sync(
            lambda sync: inspect(sync).get_indexes("recipe_usage_attempts")
        )
        assert any(index["column_names"] == ["started_at"] for index in indexes)
        await connection.run_sync(migration, "downgrade")
        assert not await connection.run_sync(lambda sync: inspect(sync).has_table("recipe_usage_attempts"))
        await connection.run_sync(migration)
    async with usage_db.limiter.attempt(1):
        pass
    assert len(await rows(usage_db)) == 1


async def test_concurrent_workers_allow_only_one_request_per_account(usage_db):
    limiters = [RecipeUsageLimiter(usage_db.factory, clock=lambda: usage_db.clock.now) for _ in range(8)]
    results = await asyncio.gather(*(limiter.reserve(1) for limiter in limiters), return_exceptions=True)
    accepted = [result for result in results if isinstance(result, uuid.UUID)]
    rejected = [result for result in results if isinstance(result, RecipeRateLimitError)]
    assert len(accepted) == 1
    assert len(rejected) == 7
    assert all(error.code == "user_request_in_progress" for error in rejected)
    assert len(await rows(usage_db)) == 1


async def test_concurrent_accounts_do_not_exceed_project_minute_limit(usage_db):
    results = await asyncio.gather(
        *(usage_db.limiter.reserve(user_id) for user_id in range(1, 18)), return_exceptions=True,
    )
    assert sum(isinstance(result, uuid.UUID) for result in results) == 12
    rejected = [result for result in results if isinstance(result, RecipeRateLimitError)]
    assert len(rejected) == 5
    assert all(error.code == "app_minute_limit" for error in rejected)
    assert len(await rows(usage_db)) == 12


async def test_rolling_minute_reopens_exactly_at_60_seconds(usage_db):
    start = usage_db.clock.now
    for seconds in (0, 10, 20):
        usage_db.clock.now = start + timedelta(seconds=seconds)
        async with usage_db.limiter.attempt(1):
            pass
    usage_db.clock.now = start + timedelta(seconds=30)
    with pytest.raises(RecipeRateLimitError) as error:
        await usage_db.limiter.reserve(1)
    assert error.value.retry_after_seconds == 30
    usage_db.clock.now = start + timedelta(seconds=60)
    async with usage_db.limiter.attempt(1):
        pass
    assert len(await rows(usage_db)) == 4


async def test_daily_quota_survives_connection_pool_and_limiter_restart(usage_db):
    for _ in range(20):
        async with usage_db.limiter.attempt(1):
            pass
        usage_db.clock.now += timedelta(seconds=61)
    await usage_db.engine.dispose()
    restarted = RecipeUsageLimiter(usage_db.factory, clock=lambda: usage_db.clock.now)
    with pytest.raises(RecipeRateLimitError) as error:
        await restarted.reserve(1)
    assert error.value.code == "user_daily_limit"
    assert len(await rows(usage_db)) == 20
    usage_db.clock.now = day_bounds(usage_db.clock.now, "Asia/Seoul")[1]
    async with restarted.attempt(1):
        pass
    assert len(await rows(usage_db)) == 21


async def test_project_daily_quota_resets_on_pacific_midnight(usage_db):
    start, reset = day_bounds(usage_db.clock.now, "America/Los_Angeles")
    async with usage_db.factory() as session, session.begin():
        session.add_all([
            RecipeUsageAttempt(
                user_id=n, started_at=start, lease_expires_at=start, finished_at=start,
            ) for n in range(1, 401)
        ])
    with pytest.raises(RecipeRateLimitError) as error:
        await usage_db.limiter.reserve(999)
    assert error.value.code == "app_daily_limit"
    assert error.value.retry_at == reset
    assert len(await rows(usage_db)) == 400
    usage_db.clock.now = reset
    async with usage_db.limiter.attempt(999):
        pass
    assert len(await rows(usage_db)) == 401


async def test_failed_call_and_request_rollback_do_not_refund_usage(usage_db):
    async with usage_db.factory() as request_session:
        await request_session.execute(select(func.count()).select_from(RecipeUsageAttempt))
        with pytest.raises(RuntimeError, match="Simulated provider failure"):
            async with usage_db.limiter.attempt(1):
                raise RuntimeError("Simulated provider failure")
        await request_session.rollback()
    persisted = await rows(usage_db)
    assert len(persisted) == 1
    assert persisted[0].finished_at is not None
    for _ in range(2):
        async with usage_db.limiter.attempt(1):
            pass
    with pytest.raises(RecipeRateLimitError) as error:
        await usage_db.limiter.reserve(1)
    assert error.value.code == "user_minute_limit"
    assert len(await rows(usage_db)) == 3


async def test_cancelled_call_releases_lease_but_keeps_usage(usage_db):
    entered = asyncio.Event()
    async def work():
        async with usage_db.limiter.attempt(1):
            entered.set()
            await asyncio.Event().wait()
    task = asyncio.create_task(work())
    await asyncio.wait_for(entered.wait(), 5)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert (await rows(usage_db))[0].finished_at is not None
    async with usage_db.limiter.attempt(1):
        pass
    assert len(await rows(usage_db)) == 2


async def test_unfinished_process_lease_expires_without_losing_usage(usage_db):
    await usage_db.limiter.reserve(1)  # Simulate a crash without cleanup.
    usage_db.clock.now += timedelta(seconds=61)
    with pytest.raises(RecipeRateLimitError) as error:
        await usage_db.limiter.reserve(1)
    assert error.value.code == "user_request_in_progress"
    usage_db.clock.now += timedelta(seconds=29)
    async with usage_db.limiter.attempt(1):
        pass
    assert len(await rows(usage_db)) == 2


async def test_prunes_only_expired_history(usage_db):
    old = usage_db.clock.now - timedelta(days=3)
    async with usage_db.factory() as session, session.begin():
        session.add(RecipeUsageAttempt(user_id=1, started_at=old, lease_expires_at=old, finished_at=old))
    async with usage_db.limiter.attempt(1):
        pass
    persisted = await rows(usage_db)
    assert len(persisted) == 1
    assert persisted[0].started_at == usage_db.clock.now


async def test_cleanup_failure_preserves_quota_and_recovers_by_lease(usage_db, monkeypatch, caplog):
    from unittest.mock import AsyncMock
    monkeypatch.setattr(usage_db.limiter, "finish", AsyncMock(side_effect=RuntimeError("private detail")))
    async with usage_db.limiter.attempt(1):
        pass
    assert "Recipe request lease cleanup failed (RuntimeError)" in caplog.text
    assert "private detail" not in caplog.text
    assert len(await rows(usage_db)) == 1
    restarted = RecipeUsageLimiter(usage_db.factory, clock=lambda: usage_db.clock.now)
    with pytest.raises(RecipeRateLimitError):
        await restarted.reserve(1)
    usage_db.clock.now += timedelta(seconds=90)
    async with restarted.attempt(1):
        pass
    assert len(await rows(usage_db)) == 2


async def test_database_failure_does_not_admit_an_ai_call(usage_db):
    from sqlalchemy.exc import ProgrammingError
    async with usage_db.engine.begin() as connection:
        await connection.run_sync(migration, "downgrade")
    entered = False
    with pytest.raises(ProgrammingError):
        async with usage_db.limiter.attempt(1):
            entered = True
    assert not entered
