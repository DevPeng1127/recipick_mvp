import os
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.database.base import Base
from app.database.connection import engine as application_engine, get_db
from app.main import app
from app.models import *  # noqa: F401, F403
from app.models.user import User
from app.utils.security import create_access_token
from tests.database import UnsafeTestDatabase, isolated_test_database, validate_test_database_url


@pytest.fixture(autouse=True)
def block_application_database(monkeypatch):
    def refuse_connection(*args, **kwargs):
        raise RuntimeError("Application DB connections are disabled in tests; use the isolated test engine.")

    # Covers services holding the default factory instead of a get_db override.
    monkeypatch.setattr(application_engine.sync_engine, "connect", refuse_connection)


@pytest.fixture
def test_database_url():
    if os.environ.get("RECIPICK_RUN_POSTGRES_TESTS") != "1":
        pytest.skip("Set RECIPICK_RUN_POSTGRES_TESTS=1 and TEST_DATABASE_URL to run local PostgreSQL tests.")
    try:
        return validate_test_database_url(
            os.environ.get("TEST_DATABASE_URL"),
            application_url=settings.DATABASE_URL, app_env=settings.APP_ENV,
        )
    except UnsafeTestDatabase as error:
        pytest.fail(str(error), pytrace=False)


@pytest.fixture
async def test_engine(test_database_url):
    async with isolated_test_database(
        test_database_url, application_url=settings.DATABASE_URL, app_env=settings.APP_ENV,
    ) as engine:
        yield engine


@pytest.fixture
async def setup_db(test_engine):
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # test_engine removes only its own random schema, including tables and enums.


@pytest.fixture
async def db(setup_db, test_engine) -> AsyncGenerator[AsyncSession, None]:
    test_session = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    async with test_session() as session:
        yield session


@pytest.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db

    previous_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = override_get_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    user = User(
        oauth_provider="kakao",
        oauth_id="test_oauth_id_123",
        nickname="테스트유저",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
async def auth_client(client: AsyncClient, test_user: User) -> AsyncClient:
    token = create_access_token(test_user.id)
    client.headers["Authorization"] = f"Bearer {token}"
    return client
