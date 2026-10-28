import asyncio
import importlib.util
from pathlib import Path
from uuid import UUID

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import delete, inspect, select

from app.models.cooking_plan import CookingPlan
from app.models.ingredient import Ingredient
from app.models.refrigerator import RefrigeratorMember
from app.schemas.recipe import GeneratedRecipe
from app.services import recipe_service, cooking_service
from tests.integration.test_consume_dispose import (
    auth_headers, inventory_sessions, snapshot, transactional_client,  # noqa: F401
)


@pytest.fixture
def ai(monkeypatch):
    calls = []
    async def generate(ingredients, preference, *, user_id, servings):
        calls.append((ingredients, user_id, servings))
        return GeneratedRecipe(title="당근 요리", recipe="당근 500g을 조리합니다.", requirements=[
            {"ingredient_name": "당근", "quantity": 500, "unit": "g"}])
    monkeypatch.setattr(recipe_service, "run_recipe_graph", generate)
    return calls


async def recommend(client, user=1, servings=1):
    response = await client.post('/api/v1/recipes/recommend', headers=auth_headers(user),
                                 json={"refrigerator_ids": [10], "servings": servings})
    assert response.status_code == 200, response.text
    return response.json()["plan_id"]


async def preview(client, id, user=1):
    response = await client.get(f'/api/v1/recipes/{id}/cooking', headers=auth_headers(user))
    assert response.status_code == 200, response.text
    return response.json()


def payload(view, quantity=.5):
    return {"items": [{"ingredient_id": 1000, "quantity": quantity,
                        "expected_token": next(s["token"] for s in view["stock"] if s["ingredient_id"] == 1000)}]}


async def consume(client, id, body, user=1):
    return await client.post(f'/api/v1/recipes/{id}/consume', headers=auth_headers(user), json=body)


@pytest.mark.parametrize("user", [1, 2])
async def test_recommend_preview_commit_and_reload_are_atomic(transactional_client, inventory_sessions, ai, user):
    before = await snapshot(inventory_sessions)
    id = await recommend(transactional_client, user, 3)
    view = await preview(transactional_client, id, user)
    assert view["servings"] == 3
    assert view["suggestions"][0]["quantity"] == .5
    assert before == await snapshot(inventory_sessions)
    response = await consume(transactional_client, id, payload(view), user)
    assert response.status_code == 200, response.text
    after = await snapshot(inventory_sessions)
    assert after["ingredients"][0]["quantity"] == 5
    assert len(after["logs"]) == len(before["logs"]) + 1
    log = after["logs"][-1]
    assert log["user_id"] == user and log["quantity"] == .5 and log["unit"] == "kg"
    assert "당근 요리 (3인분)" in log["memo"]
    assert (await preview(transactional_client, id, user))["result"] == response.json()
    assert len(ai) == 1  # preview/commit/reload do not call AI


async def test_same_request_concurrently_and_after_response_loss_is_once(transactional_client, inventory_sessions, ai):
    id = await recommend(transactional_client)
    body = payload(await preview(transactional_client, id), 5.5)
    responses = await asyncio.gather(*(consume(transactional_client, id, body) for _ in range(3)))
    assert [r.status_code for r in responses] == [200] * 3
    assert responses[0].json() == responses[1].json()
    after = await snapshot(inventory_sessions)
    assert all(i["id"] != 1000 for i in after["ingredients"])
    assert len(after["logs"]) == 2
    assert (await consume(transactional_client, id, body)).status_code == 200
    assert after == await snapshot(inventory_sessions)
    body["items"][0]["quantity"] = 1
    assert (await consume(transactional_client, id, body)).status_code == 409
    assert after == await snapshot(inventory_sessions)


@pytest.mark.parametrize("change", ["quantity", "unit", "name", "delete", "insufficient"])
async def test_stale_or_insufficient_inventory_rejects_all(transactional_client, inventory_sessions, ai, change):
    id = await recommend(transactional_client)
    view = await preview(transactional_client, id)
    body = payload(view, 6 if change == "insufficient" else .5)
    async with inventory_sessions.begin() as db:
        item = await db.get(Ingredient, 1000)
        if change == "quantity": item.quantity = 4
        if change == "unit": item.unit = "개"
        if change == "name": item.name = "변경됨"
        if change == "delete": await db.delete(item)
    before = await snapshot(inventory_sessions)
    response = await consume(transactional_client, id, body)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "inventory_changed"
    assert before == await snapshot(inventory_sessions)
    async with inventory_sessions() as db:
        assert (await db.get(CookingPlan, UUID(id))).applied_at is None


async def test_two_users_cannot_apply_stale_plans_to_same_stock(transactional_client, inventory_sessions, ai):
    a, b = await recommend(transactional_client, 1), await recommend(transactional_client, 2)
    av, bv = await preview(transactional_client, a, 1), await preview(transactional_client, b, 2)
    results = await asyncio.gather(consume(transactional_client, a, payload(av), 1), consume(transactional_client, b, payload(bv), 2))
    assert sorted(r.status_code for r in results) == [200, 409]
    state = await snapshot(inventory_sessions)
    assert state["ingredients"][0]["quantity"] == 5
    assert len(state["logs"]) == 2


async def test_multi_item_failure_rolls_back_and_new_preview_can_retry(transactional_client, inventory_sessions, ai):
    async with inventory_sessions.begin() as db:
        db.add(Ingredient(id=1001, storage_box_id=100, name="양파", quantity=2, unit="개"))
    id = await recommend(transactional_client)
    view = await preview(transactional_client, id)
    body = payload(view)
    body["items"].append({"ingredient_id": 1001, "quantity": 1, "expected_token": next(s["token"] for s in view["stock"] if s["ingredient_id"] == 1001)})
    async with inventory_sessions.begin() as db:
        (await db.get(Ingredient, 1001)).quantity = 1
    before = await snapshot(inventory_sessions)
    assert (await consume(transactional_client, id, body)).status_code == 409
    assert before == await snapshot(inventory_sessions)
    updated = await preview(transactional_client, id)
    body["items"][1]["expected_token"] = next(s["token"] for s in updated["stock"] if s["ingredient_id"] == 1001)
    assert (await consume(transactional_client, id, body)).status_code == 200
    after = await snapshot(inventory_sessions)
    assert len(after["logs"]) == len(before["logs"]) + 2
    assert all(i["id"] != 1001 for i in after["ingredients"])


async def test_failure_after_flush_rolls_back_inventory_logs_and_receipt(transactional_client, inventory_sessions, ai, monkeypatch):
    id = await recommend(transactional_client)
    body = payload(await preview(transactional_client, id))
    before = await snapshot(inventory_sessions)
    real = cooking_service.commit
    async def fail(*args):
        await real(*args)
        raise RuntimeError('injected after flush')
    monkeypatch.setattr(cooking_service, "commit", fail)
    assert (await consume(transactional_client, id, body)).status_code == 500
    assert before == await snapshot(inventory_sessions)
    async with inventory_sessions() as db:
        plan = await db.get(CookingPlan, UUID(id))
        assert plan.applied_at is None and plan.result is None and plan.request_hash is None


async def test_plan_ownership_and_removed_member_are_enforced(transactional_client, inventory_sessions, ai):
    id = await recommend(transactional_client, 2)
    view = await preview(transactional_client, id, 2)
    assert (await consume(transactional_client, id, payload(view), 1)).status_code == 404
    assert (await transactional_client.get(f'/api/v1/recipes/{id}/cooking', headers=auth_headers(3))).status_code == 404
    async with inventory_sessions.begin() as db:
        await db.execute(delete(RefrigeratorMember).where(RefrigeratorMember.user_id == 2))
    before = await snapshot(inventory_sessions)
    assert (await consume(transactional_client, id, payload(view), 2)).status_code == 403
    assert before == await snapshot(inventory_sessions)


async def test_unselected_stock_cannot_be_consumed(transactional_client, inventory_sessions, ai):
    id = await recommend(transactional_client)
    view = await preview(transactional_client, id)
    body = payload(view)
    body["items"][0]["ingredient_id"] = 2000
    before = await snapshot(inventory_sessions)
    assert (await consume(transactional_client, id, body)).status_code == 409
    assert before == await snapshot(inventory_sessions)


@pytest.mark.parametrize("quantity", [0, -1, .00001, 1_000_001, True, "NaN"])
async def test_invalid_quantities_never_change_stock(transactional_client, inventory_sessions, ai, quantity):
    id = await recommend(transactional_client)
    body = payload(await preview(transactional_client, id), quantity)
    before = await snapshot(inventory_sessions)
    assert (await consume(transactional_client, id, body)).status_code == 422
    assert before == await snapshot(inventory_sessions)


async def test_duplicate_ids_and_empty_batch_are_rejected(transactional_client, ai):
    id = await recommend(transactional_client)
    body = payload(await preview(transactional_client, id))
    body["items"] *= 2
    assert (await consume(transactional_client, id, body)).status_code == 422
    assert (await consume(transactional_client, id, {"items": []})).status_code == 422


async def test_repeat_is_explicit_new_occasion_without_ai(transactional_client, ai):
    id = await recommend(transactional_client)
    assert (await transactional_client.post(f'/api/v1/recipes/{id}/repeat', headers=auth_headers(1))).status_code == 409
    await consume(transactional_client, id, payload(await preview(transactional_client, id)))
    response = await transactional_client.post(f'/api/v1/recipes/{id}/repeat', headers=auth_headers(1))
    assert response.status_code == 201
    new_id = response.json()["plan_id"]
    assert new_id != id and (await preview(transactional_client, new_id))["applied_at"] is None
    assert len(ai) == 1


async def test_migration_round_trip(inventory_sessions, test_engine):
    before = await snapshot(inventory_sessions)
    path = Path(__file__).parents[2] / 'alembic/versions/d2c730a19e84_add_cooking_plans.py'
    spec = importlib.util.spec_from_file_location('cooking_migration', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    def run(conn):
        with Operations.context(MigrationContext.configure(conn)):
            module.downgrade()
            assert not inspect(conn).has_table('cooking_plans')
            module.upgrade()
            assert inspect(conn).has_table('cooking_plans')
    async with test_engine.begin() as conn:
        await conn.run_sync(run)
    assert before == await snapshot(inventory_sessions)
