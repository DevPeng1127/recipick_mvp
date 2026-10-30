"""Consume/dispose API checks using real transactions in an isolated PostgreSQL schema."""
from datetime import date, datetime

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.api.v1 import ingredients as ingredient_routes
from app.database import connection
from app.main import app
from app.models.ingredient import Ingredient
from app.models.ingredient_log import ActionType, IngredientLog
from app.models.refrigerator import MemberRole, Refrigerator, RefrigeratorMember
from app.models.storage import StorageBox, StorageType
from app.models.user import User
from app.utils.security import create_access_token


@pytest.fixture(params=[("consume", ActionType.CONSUMED), ("dispose", ActionType.DISPOSED)])
def action(request):
    return request.param


@pytest.fixture
async def inventory_sessions(setup_db, test_engine):
    sessions = async_sessionmaker(test_engine, expire_on_commit=False)
    created_at = datetime(2026, 10, 23)
    async with sessions.begin() as db:
        db.add_all([
            User(id=user_id, oauth_provider="kakao", oauth_id=f"inventory-{user_id}",
                 nickname=name, created_at=created_at)
            for user_id, name in [(1, "소유자"), (2, "공유 멤버"), (3, "다른 냉장고 소유자")]
        ])
        db.add_all([
            Refrigerator(id=10, name="우리 냉장고", created_at=created_at),
            Refrigerator(id=20, name="다른 냉장고", created_at=created_at),
        ])
        await db.flush()
        db.add_all([
            RefrigeratorMember(refrigerator_id=10, user_id=1, role=MemberRole.OWNER),
            RefrigeratorMember(refrigerator_id=10, user_id=2, role=MemberRole.GUEST),
            RefrigeratorMember(refrigerator_id=20, user_id=3, role=MemberRole.OWNER),
            StorageBox(id=100, refrigerator_id=10, name="채소칸", type=StorageType.FRIDGE),
            StorageBox(id=200, refrigerator_id=20, name="외부 보관함", type=StorageType.ROOM),
        ])
        await db.flush()
        db.add_all([
            Ingredient(id=1000, storage_box_id=100, name="당근", quantity=5.5,
                       unit="kg", expiry_date=date(2026, 12, 31)),
            Ingredient(id=2000, storage_box_id=200, name="사과", quantity=3,
                       unit="개", expiry_date=None),
            IngredientLog(user_id=1, refrigerator_id=10, refrigerator_name="우리 냉장고",
                          ingredient_id=999, action_type=ActionType.CONSUMED,
                          ingredient_name="이전 재료", quantity=0.5, unit="kg",
                          memo="기존 이력 보존", created_at=created_at),
        ])
    return sessions


@pytest.fixture
async def transactional_client(inventory_sessions, monkeypatch):
    # Keep the production get_db dependency: it must commit or roll back itself.
    # Only its session factory is redirected to the guarded test engine.
    assert connection.get_db not in app.dependency_overrides
    monkeypatch.setattr(connection, "async_session", inventory_sessions)
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def auth_headers(user_id):
    return {"Authorization": f"Bearer {create_access_token(user_id)}"}


def endpoint(action, *, storage_box_id=100, ingredient_id=1000):
    return f"/api/v1/storage-boxes/{storage_box_id}/ingredients/{ingredient_id}/{action[0]}"


async def read_state(db):
    # Select table columns, not cached ORM instances, to observe executed SQL.
    return {
        name: [dict(row) for row in (await db.execute(
            select(model.__table__).order_by(model.id)
        )).mappings()]
        for name, model in [("ingredients", Ingredient), ("logs", IngredientLog)]
    }


async def snapshot(sessions):
    # Each call has its own session, so uncommitted request writes cannot pass.
    async with sessions() as db:
        return await read_state(db)


def assert_operation(before, after, action, *, quantity, user_id=1, memo=None):
    original = before["ingredients"][0]
    full = quantity is None or quantity >= original["quantity"]
    expected_ingredients = [dict(row) for row in before["ingredients"]]
    if full:
        expected_ingredients.pop(0)
    else:
        expected_ingredients[0]["quantity"] = round(original["quantity"] - quantity, 4)
    assert after["ingredients"] == expected_ingredients
    assert after["logs"][:-1] == before["logs"]
    assert len(after["logs"]) == len(before["logs"]) + 1
    log = after["logs"][-1]
    assert log["id"] > before["logs"][-1]["id"]
    assert isinstance(log["created_at"], datetime)
    assert {key: value for key, value in log.items() if key not in {"id", "created_at"}} == {
        "user_id": user_id,
        "refrigerator_id": 10,
        "refrigerator_name": "우리 냉장고",
        "ingredient_id": 1000,
        "action_type": action[1],
        "ingredient_name": original["name"],
        "quantity": original["quantity"] if full else quantity,
        "unit": original["unit"],
        "expiry_date": original["expiry_date"],
        "expiry_source": original["expiry_source"],
        "memo": memo,
    }


@pytest.mark.parametrize("user_id", [1, 2], ids=["owner", "guest"])
async def test_partial_operation_commits_quantity_and_exact_history(
    transactional_client, inventory_sessions, action, user_id,
):
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(
        endpoint(action), headers=auth_headers(user_id),
        json={"quantity": 1.25, "memo": "일부 처리"},
    )
    assert response.status_code == 200
    assert response.json() == {
        "id": 1000, "storage_box_id": 100, "name": "당근", "quantity": 4.25,
        "unit": "kg", "expiry_date": "2026-12-31", "expiry_source": "unknown",
    }
    assert_operation(before, await snapshot(inventory_sessions), action,
                     quantity=1.25, user_id=user_id, memo="일부 처리")


@pytest.mark.parametrize("quantity", [None, 5.5, 8.0], ids=["no-body", "equal", "above-stock"])
async def test_full_operation_deletes_inventory_but_preserves_actual_quantity_in_history(
    transactional_client, inventory_sessions, action, quantity,
):
    before = await snapshot(inventory_sessions)
    # Preserve the current policy: omitted quantity or quantity >= stock means full.
    body = {} if quantity is None else {"json": {"quantity": quantity}}
    response = await transactional_client.post(endpoint(action), headers=auth_headers(1), **body)
    assert response.status_code == 204
    assert response.content == b""
    assert_operation(before, await snapshot(inventory_sessions), action, quantity=quantity)


@pytest.mark.parametrize("quantity", [1.25, None], ids=["partial", "full"])
async def test_error_after_writes_rolls_back_both_inventory_and_history(
    transactional_client, inventory_sessions, action, quantity, monkeypatch,
):
    before = await snapshot(inventory_sessions)
    real_operation = ingredient_routes.consume_or_dispose_ingredient
    observed = []

    async def fail_after_flush(**kwargs):
        await real_operation(**kwargs)
        observed.append(await read_state(kwargs["db"]))
        raise RuntimeError("simulated error after inventory and history SQL")

    monkeypatch.setattr(ingredient_routes, "consume_or_dispose_ingredient", fail_after_flush)
    response = await transactional_client.post(
        endpoint(action), headers=auth_headers(1), json={"quantity": quantity},
    )
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}
    # Prove both writes actually happened before the error, not just an early 500.
    assert len(observed) == 1
    assert_operation(before, observed[0], action, quantity=quantity)
    assert await snapshot(inventory_sessions) == before


@pytest.mark.parametrize("quantity", [1.25, None], ids=["partial", "full"])
async def test_database_rejection_of_history_leaves_inventory_unchanged(
    transactional_client, inventory_sessions, test_engine, action, quantity, caplog,
):
    # This extra constraint exists only in this test's disposable schema.
    async with test_engine.begin() as db:
        await db.execute(text(
            "ALTER TABLE ingredient_logs ADD CONSTRAINT reject_test_history "
            "CHECK (memo IS DISTINCT FROM 'reject-test-history')"
        ))
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post(
        endpoint(action), headers=auth_headers(1),
        json={"quantity": quantity, "memo": "reject-test-history"},
    )
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}
    assert "IntegrityError" in caplog.text
    assert await snapshot(inventory_sessions) == before


@pytest.mark.parametrize(
    ("user_id", "ingredient_id", "expected_status"),
    [(None, 1000, 401), (3, 1000, 403), (1, 2000, 404)],
    ids=["invalid-token", "not-a-member", "foreign-ingredient-in-own-box-path"],
)
async def test_unauthorized_operation_cannot_change_inventory_or_history(
    transactional_client, inventory_sessions, action, user_id, ingredient_id, expected_status,
):
    before = await snapshot(inventory_sessions)
    headers = auth_headers(user_id) if user_id is not None else {"Authorization": "Bearer invalid"}
    response = await transactional_client.post(
        endpoint(action, ingredient_id=ingredient_id), headers=headers, json={"quantity": 1.25},
    )
    assert response.status_code == expected_status
    assert await snapshot(inventory_sessions) == before
