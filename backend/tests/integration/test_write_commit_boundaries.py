"""Observe committed rows at HTTP response start and real PostgreSQL commit failures."""
import asyncio
import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import event, select, text

from app.ai import gemini_client
from app.database import connection
from app.main import app
from app.models.cooking_plan import CookingPlan
from app.models.ingredient import Ingredient
from app.models.ingredient_log import IngredientLog
from app.models.invitation import RefrigeratorInvitation
from app.models.recipe_usage import RecipeUsageAttempt
from app.models.refrigerator import Refrigerator, RefrigeratorMember
from app.models.storage import StorageBox
from app.models.user import User, UserPreference
from app.services import auth_service
from app.utils.security import create_oauth_state, decode_token
from tests.integration.test_consume_dispose import auth_headers, inventory_sessions  # noqa: F401
from tests.integration.test_menu_consistency import linked_menu


FRIDGE = "/api/v1/refrigerators/10"
ITEMS = "/api/v1/storage-boxes/100/ingredients"
PLAN_ID = UUID(int=77)
INVITATION_TOKEN = "a" * 43
BUSINESS_MODELS = (
    User, UserPreference, Refrigerator, RefrigeratorMember, StorageBox,
    Ingredient, IngredientLog, RefrigeratorInvitation, CookingPlan,
)


@dataclass(frozen=True)
class WriteCase:
    name: str
    method: str
    path: str
    changed_tables: set[str]
    body: dict = field(default_factory=dict)
    user: int = 1
    status: int = 200


CASES = [
    WriteCase("ingredient-create", "POST", ITEMS, {"ingredients"},
              {"name": "양파", "quantity": 2, "unit": "개"}, status=201),
    WriteCase("ingredient-update", "PUT", ITEMS + "/1000", {"ingredients"}, {"name": "수정당근"}),
    WriteCase("consume-partial", "POST", ITEMS + "/1000/consume", {"ingredients", "ingredient_logs"}, {"quantity": 1}),
    WriteCase("consume-full", "POST", ITEMS + "/1000/consume", {"ingredients", "ingredient_logs"}, status=204),
    WriteCase("dispose-partial", "POST", ITEMS + "/1000/dispose", {"ingredients", "ingredient_logs"}, {"quantity": 1}),
    WriteCase("dispose-full", "POST", ITEMS + "/1000/dispose", {"ingredients", "ingredient_logs"}, status=204),
    WriteCase("fridge-create", "POST", "/api/v1/refrigerators", {"refrigerators", "refrigerator_members"},
              {"name": "새냉장고"}, status=201),
    WriteCase("fridge-initial", "POST", "/api/v1/refrigerators/initial", {"refrigerators", "refrigerator_members"}, user=4),
    WriteCase("fridge-update", "PUT", FRIDGE, {"refrigerators"}, {"name": "수정냉장고"}),
    WriteCase("favorite", "PATCH", FRIDGE + "/favorite", {"refrigerator_members"}),
    WriteCase("box-create", "POST", FRIDGE + "/storage-boxes", {"storage_boxes"},
              {"name": "새보관함", "type": "FREEZER"}, status=201),
    WriteCase("box-update", "PUT", FRIDGE + "/storage-boxes/100", {"storage_boxes"}, {"name": "수정보관함"}),
    WriteCase("invite-create", "POST", FRIDGE + "/invitations", {"refrigerator_invitations"}, status=201),
    WriteCase("invite-revoke", "DELETE", FRIDGE + "/invitations/1", {"refrigerator_invitations"}, status=204),
    WriteCase("invite-accept", "POST", "/api/v1/invitations/accept", {"refrigerator_invitations", "refrigerator_members"},
              {"token": INVITATION_TOKEN}, user=3),
    WriteCase("member-leave", "DELETE", FRIDGE + "/members/me", {"refrigerator_members"}, user=2, status=204),
    WriteCase("member-remove", "DELETE", FRIDGE + "/members/2", {"refrigerator_members"}, status=204),
    WriteCase("nickname", "PATCH", "/api/v1/users/me", {"users"}, {"nickname": "변경닉네임"}),
    WriteCase("preference-create", "PUT", "/api/v1/users/me/preference", {"user_preferences"}, {"max_time": 30}),
    WriteCase("preference-update", "PUT", "/api/v1/users/me/preference", {"user_preferences"}, {"max_time": 30}, user=2),
    WriteCase("oauth-kakao", "POST", "/api/v1/auth/kakao/callback", {"users"}),
    WriteCase("oauth-google", "POST", "/api/v1/auth/google/callback", {"users"}),
    WriteCase("menu-recommend", "POST", "/api/v1/recipes/recommend", {"cooking_plans"}, {"refrigerator_ids": [10]}),
    WriteCase("menu-repeat", "POST", f"/api/v1/recipes/{PLAN_ID}/repeat", {"cooking_plans"}, status=201),
]


async def business_snapshot(sessions):
    async with sessions() as db:
        return {
            model.__tablename__: [dict(row) for row in (await db.execute(
                select(model.__table__).order_by(model.id)
            )).mappings()]
            for model in BUSINESS_MODELS
        }


@pytest.fixture
async def write_state(inventory_sessions, monkeypatch):
    now = datetime.now(timezone.utc)
    async with inventory_sessions.begin() as db:
        db.add(User(id=4, oauth_provider="kakao", oauth_id="commit-new-4", nickname="새회원"))
        db.add(UserPreference(user_id=2, max_time=10))
        db.add(RefrigeratorInvitation(
            refrigerator_id=10, token_hash=hashlib.sha256(INVITATION_TOKEN.encode()).hexdigest(),
            expires_at=now + timedelta(days=1),
        ))
        db.add(CookingPlan(id=PLAN_ID, user_id=1, title="당근 찜", recipe="당근을 찝니다.",
                           servings=1, refrigerator_ids=[10], requirements=[], applied_at=now))
        await db.flush()
        # The shared fixture supplies explicit IDs; advance this sequence before OAuth inserts.
        await db.execute(text("SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT max(id) FROM users))"))

    for provider in ("kakao", "google"):
        monkeypatch.setattr(auth_service, f"exchange_{provider}_code", AsyncMock(return_value={
            "oauth_provider": provider, "oauth_id": f"new-commit-{provider}", "nickname": "신규회원",
        }))
    return inventory_sessions


@pytest.fixture
async def observed_client(write_state, test_engine, monkeypatch):
    assert connection.get_db not in app.dependency_overrides
    monkeypatch.setattr(connection, "async_session", write_state)
    observations = SimpleNamespace(responses=[], sqlstates=[], provider_requests=[])

    async def observed_app(scope, receive, send):
        async def observe_send(message):
            if message["type"] == "http.response.start":
                # Query from an independent transaction before forwarding success to the client.
                observations.responses.append((message["status"], await business_snapshot(write_state)))
            await send(message)
        await app(scope, receive, observe_send)

    def database_error(context):
        observations.sqlstates.append(getattr(context.original_exception, "sqlstate", None))

    def bound_transaction(conn):
        conn.exec_driver_sql("SET LOCAL statement_timeout = '10s'")
        conn.exec_driver_sql("SET LOCAL lock_timeout = '8s'")

    def provider_response(request):
        observations.provider_requests.append(request.url.path)
        return httpx.Response(200, json={"candidates": [{"finishReason": "STOP", "content": {
            "parts": [{"text": json.dumps(linked_menu())}],
        }}]})

    client_type = httpx.AsyncClient
    transport = httpx.ASGITransport(app=observed_app, raise_app_exceptions=False)
    async with client_type(transport=transport, base_url="http://test") as client:
        monkeypatch.setattr(gemini_client.settings, "GEMINI_API_KEY", SecretStr("synthetic-commit-test-key"))
        monkeypatch.setattr(gemini_client.recipe_usage_limiter, "session_factory", write_state)
        monkeypatch.setattr(gemini_client.httpx, "AsyncClient",
                            lambda **kwargs: client_type(transport=httpx.MockTransport(provider_response), **kwargs))
        event.listen(test_engine.sync_engine, "handle_error", database_error)
        event.listen(test_engine.sync_engine, "begin", bound_transaction)
        try:
            yield client, observations
        finally:
            event.remove(test_engine.sync_engine, "handle_error", database_error)
            event.remove(test_engine.sync_engine, "begin", bound_transaction)


async def defer_commit_failure(test_engine):
    # A real deferred constraint error occurs only at COMMIT, after all service flushes.
    # Everything is created inside the fixture's disposable, guarded schema.
    async with test_engine.begin() as db:
        await db.execute(text("""
            CREATE FUNCTION reject_test_commit() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                RAISE EXCEPTION 'synthetic deferred commit failure' USING ERRCODE = '23514';
            END;
            $$
        """))
        for model in BUSINESS_MODELS:
            await db.execute(text(
                f'CREATE CONSTRAINT TRIGGER reject_test_commit AFTER INSERT OR UPDATE OR DELETE '
                f'ON "{model.__tablename__}" DEFERRABLE INITIALLY DEFERRED '
                'FOR EACH ROW EXECUTE FUNCTION reject_test_commit()'
            ))


@pytest.mark.parametrize("case", CASES, ids=lambda case: case.name)
@pytest.mark.parametrize("reject_commit", [False, True], ids=["success", "commit-failure"])
async def test_write_response_reflects_final_commit(
    observed_client, write_state, test_engine, case, reject_commit,
):
    client, observed = observed_client
    before = await business_snapshot(write_state)
    if reject_commit:
        await defer_commit_failure(test_engine)
    body = case.body
    if case.name.startswith("oauth-"):
        body = {"code": "synthetic-code", "state": create_oauth_state()}
    async with asyncio.timeout(15):
        response = await client.request(case.method, case.path, headers=auth_headers(case.user), json=body)
    after = await business_snapshot(write_state)
    assert len(observed.responses) == 1
    sent_status, visible_at_response = observed.responses[0]
    assert sent_status == response.status_code

    if reject_commit:
        assert observed.sqlstates == ["23514"], "Failure must occur in PostgreSQL's final COMMIT."
        assert after == before, "All business writes must roll back together."
        assert visible_at_response == before
        assert response.status_code == 500
        detail = "OAuth authentication failed" if case.name.startswith("oauth-") else "Internal server error"
        assert response.json() == {"detail": detail}
    else:
        assert observed.sqlstates == []
        assert response.status_code == case.status, response.text
        assert {table for table in after if before[table] != after[table]} == case.changed_tables
        assert visible_at_response == after, "Committed data must be visible before HTTP success starts."
        if case.name.startswith("oauth-"):
            user_id = int(decode_token(response.json()["access_token"])["sub"])
            assert any(row["id"] == user_id for row in visible_at_response["users"])

    async with write_state() as db:
        attempts = (await db.scalars(select(RecipeUsageAttempt))).all()
    expected_calls = 1 if case.name == "menu-recommend" else 0
    assert len(observed.provider_requests) == len(attempts) == expected_calls
    # A completed provider call counts even if saving its menu later fails.
    assert all(attempt.finished_at is not None for attempt in attempts)
