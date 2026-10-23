"""Explicit local test DB validation and per-test PostgreSQL schema isolation."""
import re
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import ArgumentError
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.schema import CreateSchema, DropSchema


class UnsafeTestDatabase(ValueError):
    """A test target cannot be safely identified; messages never include URLs."""


def validate_test_database_url(
    test_url: str | URL | None, *, application_url: str | URL, app_env: str,
) -> URL:
    if app_env != "development":
        raise UnsafeTestDatabase("PostgreSQL tests require APP_ENV=development.")
    if not test_url:
        raise UnsafeTestDatabase("Set TEST_DATABASE_URL explicitly to a separate local test database.")
    try:
        url = make_url(test_url)
        application = make_url(application_url)
    except (ArgumentError, TypeError, ValueError):
        raise UnsafeTestDatabase("Invalid database URL configuration.") from None
    if url.drivername != "postgresql+asyncpg":
        raise UnsafeTestDatabase("TEST_DATABASE_URL must use postgresql+asyncpg.")
    if not url.host or url.host.lower() not in {"localhost", "127.0.0.1", "::1"}:
        raise UnsafeTestDatabase("TEST_DATABASE_URL must use a local loopback host.")
    if not url.username or (url.port is not None and not 1 <= url.port <= 65535):
        raise UnsafeTestDatabase("TEST_DATABASE_URL requires a username and a valid port.")
    # Query parameters can override host/database or connection settings.
    if url.query or application.query:
        raise UnsafeTestDatabase("Database URL query parameters are not allowed for PostgreSQL tests.")
    if not url.database or not re.fullmatch(r"[a-z][a-z0-9_]{0,57}_test", url.database):
        raise UnsafeTestDatabase("The test database name must be lowercase, end in _test, and contain at most 63 characters.")
    # Intentionally conservative across aliases, users, hosts and ports: the
    # application DB name itself cannot be used as the test target anywhere.
    if not application.database or url.database.casefold() == application.database.casefold():
        raise UnsafeTestDatabase("The test database name must differ from the application database name.")
    return url


@asynccontextmanager
async def isolated_test_database(
    test_url: str | URL | None, *, application_url: str | URL, app_env: str,
) -> AsyncIterator[AsyncEngine]:
    # Validate before constructing any test engine or making a connection.
    url = validate_test_database_url(test_url, application_url=application_url, app_env=app_env)
    schema = f"recipick_test_{uuid.uuid4().hex}"
    admin = create_async_engine(url, echo=False, hide_parameters=True)
    engine = None
    created = False
    try:
        async with admin.begin() as connection:
            database = await connection.scalar(text("SELECT current_database()"))
            if database != url.database:
                raise UnsafeTestDatabase("Connected database does not match the validated test target.")
            await connection.execute(CreateSchema(schema))
        created = True
        engine = create_async_engine(
            url, echo=False, hide_parameters=True, max_overflow=15,
            connect_args={"server_settings": {
                "search_path": schema, "application_name": "recipick-tests",
            }},
        )
        async with engine.begin() as connection:
            current_schema = await connection.scalar(text("SELECT current_schema()"))
            search_path = await connection.scalar(text("SHOW search_path"))
            if current_schema != schema or search_path != schema:
                raise UnsafeTestDatabase("The test schema is not active; refusing table operations.")
        yield engine
    finally:
        try:
            if engine is not None:
                await engine.dispose()
        finally:
            try:
                if created:
                    # Only this invocation's random schema may be removed.
                    if not re.fullmatch(r"recipick_test_[0-9a-f]{32}", schema):
                        raise UnsafeTestDatabase("Refusing to remove an unrecognized test schema.")
                    async with admin.begin() as connection:
                        await connection.execute(DropSchema(schema, cascade=True))
            finally:
                await admin.dispose()
