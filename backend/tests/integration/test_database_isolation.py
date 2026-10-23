"""Real PostgreSQL checks for the safety fixtures, only with explicit opt-in."""
import pytest
from sqlalchemy import select, text

from app.config import settings
from app.models.user import User
from tests.database import isolated_test_database


@pytest.mark.parametrize("fail_body", [False, True])
async def test_cleanup_preserves_another_schema_and_removes_only_its_own(
    test_database_url, test_engine, fail_body,
):
    async with test_engine.begin() as connection:
        owner = await connection.scalar(text("SELECT current_schema()"))
        await connection.execute(text("CREATE TABLE isolation_marker (value text NOT NULL)"))
        await connection.execute(text("INSERT INTO isolation_marker VALUES ('keep')"))
    error = RuntimeError("simulated test failure")
    try:
        async with isolated_test_database(
            test_database_url, application_url=settings.DATABASE_URL, app_env=settings.APP_ENV,
        ) as other:
            async with other.begin() as connection:
                disposable = await connection.scalar(text("SELECT current_schema()"))
                assert disposable != owner
                assert await connection.scalar(text("SELECT to_regclass('isolation_marker')")) is None
                await connection.execute(text("CREATE TABLE isolation_marker (value text NOT NULL)"))
                await connection.execute(text("INSERT INTO isolation_marker VALUES ('discard')"))
            if fail_body:
                raise error
    except RuntimeError as caught:
        assert caught is error
    async with test_engine.connect() as connection:
        assert await connection.scalar(text("SELECT value FROM isolation_marker")) == "keep"
        assert not await connection.scalar(
            text("SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = :schema)"),
            {"schema": disposable},
        )


async def test_common_fixture_creates_models_and_commits_in_its_own_schema(db, test_user, test_database_url):
    assert await db.scalar(text("SELECT current_database()")) == test_database_url.database
    schema = await db.scalar(text("SELECT current_schema()"))
    assert schema.startswith("recipick_test_")
    assert await db.scalar(text("SHOW search_path")) == schema
    user = await db.scalar(select(User).where(User.id == test_user.id))
    assert user.oauth_id == "test_oauth_id_123"
    assert await db.scalar(
        text("SELECT count(*) FROM pg_type WHERE typnamespace = to_regnamespace(:schema) AND typtype = 'e'"),
        {"schema": schema},
    ) > 0
