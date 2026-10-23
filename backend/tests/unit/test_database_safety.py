import traceback
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from sqlalchemy.schema import CreateSchema, DropSchema

from tests import database

APP_URL = "postgresql+asyncpg://app:app-password@localhost:5432/recipick"
TEST_URL = "postgresql+asyncpg://tester:test-password@127.0.0.1:5432/recipick_test"


@pytest.mark.parametrize("test_url,application_url,app_env", [
    (None, APP_URL, "development"),
    ("", APP_URL, "development"),
    ("not-a-url-private-password", APP_URL, "development"),
    ("postgresql+asyncpg://tester:private-password@localhost:bad/recipick_test", APP_URL, "development"),
    (TEST_URL, APP_URL, "production"),
    (TEST_URL, APP_URL, "test"),
    (APP_URL, APP_URL, "development"),
    (TEST_URL.replace("recipick_test", "other"), APP_URL, "development"),
    (TEST_URL.replace("recipick_test", "test_recipick"), APP_URL, "development"),
    (TEST_URL.replace("recipick_test", "recipick_test_backup"), APP_URL, "development"),
    (TEST_URL.replace("recipick_test", "Recipick_test"), APP_URL, "development"),
    (TEST_URL.replace("recipick_test", "a" * 59 + "_test"), APP_URL, "development"),
    (TEST_URL.replace("recipick_test", ""), APP_URL, "development"),
    (TEST_URL.replace("recipick_test", "recipick%5ftest"), APP_URL, "development"),
    (TEST_URL.replace("127.0.0.1", "db.example.com"), APP_URL, "development"),
    (TEST_URL.replace("127.0.0.1", "localhost.example.com"), APP_URL, "development"),
    (TEST_URL.replace("127.0.0.1", "0.0.0.0"), APP_URL, "development"),
    (TEST_URL.replace("127.0.0.1", ""), APP_URL, "development"),
    (TEST_URL.replace("tester:test-password@", ""), APP_URL, "development"),
    (TEST_URL.replace(":5432", ":0"), APP_URL, "development"),
    (TEST_URL.replace(":5432", ":65536"), APP_URL, "development"),
    (TEST_URL.replace("postgresql+asyncpg", "postgresql"), APP_URL, "development"),
    ("sqlite:///:memory:", APP_URL, "development"),
    (TEST_URL + "?host=db.example.com", APP_URL, "development"),
    (TEST_URL + "?database=recipick", APP_URL, "development"),
    (TEST_URL + "?server_settings=unsafe", APP_URL, "development"),
    (TEST_URL, APP_URL + "?database=recipick_test", "development"),
    (TEST_URL, "private-password-invalid-app-url", "development"),
    (TEST_URL, APP_URL.replace("/recipick", "/"), "development"),
    # Credentials, localhost aliases and different ports must not bypass DB-name isolation.
    (TEST_URL, "postgresql+asyncpg://other:secret@localhost/recipick_test", "development"),
    (TEST_URL, "postgresql+asyncpg://other:secret@[::1]:5432/recipick_test", "development"),
    (TEST_URL, "postgresql+asyncpg://other:secret@localhost:5433/recipick_test", "development"),
])
async def test_unsafe_settings_never_construct_an_engine(monkeypatch, test_url, application_url, app_env):
    factory = Mock(side_effect=AssertionError("No DB access is allowed"))
    monkeypatch.setattr(database, "create_async_engine", factory)
    with pytest.raises(database.UnsafeTestDatabase) as error:
        async with database.isolated_test_database(test_url, application_url=application_url, app_env=app_env):
            pytest.fail("Unsafe test target was admitted")
    factory.assert_not_called()
    message = "".join(traceback.format_exception(error.value))
    assert "private-password" not in message
    assert "test-password" not in message
    assert "app-password" not in message


@pytest.mark.parametrize("host", ["localhost", "LOCALHOST", "127.0.0.1", "[::1]"])
def test_accepts_explicit_local_test_target_with_encoded_credentials(host):
    url = database.validate_test_database_url(
        f"postgresql+asyncpg://tester:p%40ss%2Fword@{host}/custom_test",
        application_url=APP_URL, app_env="development",
    )
    assert url.database == "custom_test"
    assert url.password == "p@ss/word"


@pytest.fixture
def engines(monkeypatch):
    built = []

    def build(url, **kwargs):
        scalar = "recipick_test" if not built else kwargs["connect_args"]["server_settings"]["search_path"]
        connection = SimpleNamespace(scalar=AsyncMock(return_value=scalar), execute=AsyncMock())

        @asynccontextmanager
        async def begin():
            yield connection

        engine = SimpleNamespace(begin=begin, dispose=AsyncMock(), connection=connection, kwargs=kwargs)
        built.append(engine)
        return engine

    factory = Mock(side_effect=build)
    monkeypatch.setattr(database, "create_async_engine", factory)
    return SimpleNamespace(built=built, factory=factory, build=build)


def isolated():
    return database.isolated_test_database(TEST_URL, application_url=APP_URL, app_env="development")


@pytest.mark.parametrize("fail_body", [False, True])
async def test_only_owned_schema_is_dropped_and_engines_are_disposed(engines, fail_body):
    error = RuntimeError("test body failed")
    try:
        async with isolated() as engine:
            assert engine is engines.built[1]
            search_path = engine.kwargs["connect_args"]["server_settings"]["search_path"]
            assert search_path.startswith("recipick_test_")
            assert "," not in search_path  # No public fallback.
            if fail_body:
                raise error
    except RuntimeError as caught:
        assert caught is error
    admin, scoped = engines.built
    statements = [call.args[0] for call in admin.connection.execute.await_args_list]
    assert len(statements) == 2
    assert isinstance(statements[0], CreateSchema)
    assert isinstance(statements[1], DropSchema)
    assert statements[0].element == statements[1].element == search_path
    assert statements[1].cascade
    admin.dispose.assert_awaited_once()
    scoped.dispose.assert_awaited_once()


async def test_schema_creation_failure_never_drops_an_existing_schema(engines):
    def build(url, **kwargs):
        engine = engines.build(url, **kwargs)
        engine.connection.execute.side_effect = RuntimeError("schema already exists")
        return engine

    engines.factory.side_effect = build
    with pytest.raises(RuntimeError, match="schema already exists"):
        async with isolated():
            pytest.fail("Schema creation should fail")
    assert len(engines.built) == 1
    admin = engines.built[0]
    admin.connection.execute.assert_awaited_once()
    admin.dispose.assert_awaited_once()


async def test_wrong_connected_database_is_rejected_before_schema_creation(engines):
    def build(url, **kwargs):
        engine = engines.build(url, **kwargs)
        engine.connection.scalar.return_value = "recipick"
        return engine

    engines.factory.side_effect = build
    with pytest.raises(database.UnsafeTestDatabase, match="Connected database"):
        async with isolated():
            pytest.fail("Unexpected database was admitted")
    admin, = engines.built
    admin.connection.execute.assert_not_awaited()
    admin.dispose.assert_awaited_once()


@pytest.mark.parametrize("public_fallback", [False, True])
async def test_wrong_search_path_is_rejected_before_table_operations(engines, public_fallback):
    def build(url, **kwargs):
        engine = engines.build(url, **kwargs)
        if len(engines.built) == 2:
            schema = kwargs["connect_args"]["server_settings"]["search_path"]
            engine.connection.scalar.side_effect = [schema, f"{schema}, public"] if public_fallback else ["public", "public"]
        return engine

    engines.factory.side_effect = build
    with pytest.raises(database.UnsafeTestDatabase, match="schema is not active"):
        async with isolated():
            pytest.fail("Unexpected schema was admitted")
    admin, scoped = engines.built
    assert isinstance(admin.connection.execute.await_args.args[0], DropSchema)
    scoped.connection.execute.assert_not_awaited()
    admin.dispose.assert_awaited_once()
    scoped.dispose.assert_awaited_once()


@pytest.mark.parametrize("enabled", [None, "0", "true"])
def test_postgres_fixture_requires_explicit_opt_in(monkeypatch, enabled):
    from tests import conftest as fixtures
    monkeypatch.delenv("RECIPICK_RUN_POSTGRES_TESTS", raising=False)
    if enabled is not None:
        monkeypatch.setenv("RECIPICK_RUN_POSTGRES_TESTS", enabled)
    validate = Mock(side_effect=AssertionError("Should skip before reading DB settings"))
    monkeypatch.setattr(fixtures, "validate_test_database_url", validate)
    with pytest.raises(pytest.skip.Exception, match="RECIPICK_RUN_POSTGRES_TESTS"):
        fixtures.test_database_url.__wrapped__()
    validate.assert_not_called()


@pytest.mark.parametrize("test_url", [None, APP_URL, "invalid-secret-url"])
def test_opted_in_fixture_fails_closed_without_a_safe_explicit_url(monkeypatch, test_url):
    from tests import conftest as fixtures
    monkeypatch.setenv("RECIPICK_RUN_POSTGRES_TESTS", "1")
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
    if test_url is not None:
        monkeypatch.setenv("TEST_DATABASE_URL", test_url)
    monkeypatch.setattr(fixtures.settings, "DATABASE_URL", APP_URL)
    monkeypatch.setattr(fixtures.settings, "APP_ENV", "development")
    with pytest.raises(pytest.fail.Exception) as error:
        fixtures.test_database_url.__wrapped__()
    assert "secret" not in str(error.value)


async def test_application_session_factory_cannot_connect_to_the_app_database():
    from sqlalchemy import text
    from app.database.connection import async_session
    with pytest.raises(RuntimeError, match="Application DB connections are disabled"):
        async with async_session() as session:
            await session.execute(text("SELECT 1"))


@pytest.mark.parametrize("failure", ["scoped_engine", "drop", "dispose"])
async def test_partial_setup_and_cleanup_failures_still_dispose_admin(engines, failure):
    def build(url, **kwargs):
        if failure == "scoped_engine" and engines.built:
            raise RuntimeError("scoped_engine")
        engine = engines.build(url, **kwargs)
        if len(engines.built) == 1 and failure == "drop":
            engine.connection.execute.side_effect = [None, RuntimeError("drop")]
        if len(engines.built) == 2 and failure == "dispose":
            engine.dispose.side_effect = RuntimeError("dispose")
        return engine

    engines.factory.side_effect = build
    with pytest.raises(RuntimeError, match=failure):
        async with isolated():
            pass
    admin = engines.built[0]
    admin.dispose.assert_awaited_once()
    assert isinstance(admin.connection.execute.await_args.args[0], DropSchema)
