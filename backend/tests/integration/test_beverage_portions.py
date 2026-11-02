import json
from unittest.mock import AsyncMock
from uuid import UUID

import pytest

from app.ai import recipe_graph
from app.models.cooking_plan import CookingPlan
from app.models.ingredient import Ingredient
from tests.integration.test_consume_dispose import (
    auth_headers, inventory_sessions, snapshot, transactional_client,  # noqa: F401
)
from tests.unit.test_beverage_portions import beverage_menu


@pytest.mark.parametrize("servings,ai_quantity,ai_unit,expected,actual", [
    (1, 1, "L", .25, .25), (2, 1000, "ml", .5, .5),
    (1, 1, "L", .25, .3),  # The user can override the suggestion.
])
async def test_corrected_amount_persists_converts_and_consumes_only_confirmed_volume(
    transactional_client, inventory_sessions, monkeypatch, servings, ai_quantity, ai_unit, expected, actual,
):
    async with inventory_sessions.begin() as db:
        stock = await db.get(Ingredient, 1000)
        stock.name, stock.quantity, stock.unit = "크랜베리 주스", 1, "L"
    before = await snapshot(inventory_sessions)
    ai = AsyncMock(return_value=json.dumps(beverage_menu(quantity=ai_quantity, unit=ai_unit)))
    monkeypatch.setattr(recipe_graph, "call_gemini", ai)
    response = await transactional_client.post('/api/v1/recipes/recommend', headers=auth_headers(1),
        json={"refrigerator_ids": [10], "servings": servings})
    assert response.status_code == 200, response.text
    plan_id = response.json()["plan_id"]
    preview_url = f'/api/v1/recipes/{plan_id}/cooking'
    view = (await transactional_client.get(preview_url, headers=auth_headers(1))).json()
    assert "사용량 보정 안내" in view["recipe"] and f"총 {250 * servings}mL로 보정" in view["recipe"]
    assert view["suggestions"][0]["quantity"] == expected
    assert view["suggestions"][0]["ingredient_id"] == 1000
    assert before == await snapshot(inventory_sessions)
    async with inventory_sessions() as db:
        plan = await db.get(CookingPlan, UUID(plan_id))
        assert plan.recipe == view["recipe"] == response.json()["recipe"]
        assert plan.requirements == view["requirements"]
    body = {"items": [{"ingredient_id": 1000, "quantity": actual, "expected_token": view["stock"][0]["token"]}]}
    consumed = await transactional_client.post(f'/api/v1/recipes/{plan_id}/consume', headers=auth_headers(1), json=body)
    assert consumed.status_code == 200
    after = await snapshot(inventory_sessions)
    assert after["ingredients"][0]["quantity"] == pytest.approx(1 - actual)
    assert after["logs"][-1]["quantity"] == actual
    assert after["logs"][-1]["unit"] == "L"
    assert after["ingredients"][1:] == before["ingredients"][1:]
    assert after["logs"][:-1] == before["logs"]
    reloaded = (await transactional_client.get(preview_url, headers=auth_headers(1))).json()
    assert reloaded["recipe"] == view["recipe"] and reloaded["applied_at"]
    repeat = await transactional_client.post(f'/api/v1/recipes/{plan_id}/repeat', headers=auth_headers(1))
    assert repeat.status_code == 201 and repeat.json()["recipe"] == view["recipe"]
    assert ai.await_count == 1


async def test_short_stock_is_reported_instead_of_inventing_volume(transactional_client, inventory_sessions, monkeypatch):
    async with inventory_sessions.begin() as db:
        stock = await db.get(Ingredient, 1000)
        stock.name, stock.quantity, stock.unit = "크랜베리 주스", .1, "L"
    before = await snapshot(inventory_sessions)
    monkeypatch.setattr(recipe_graph, "call_gemini", AsyncMock(return_value=json.dumps(beverage_menu())))
    response = await transactional_client.post('/api/v1/recipes/recommend', headers=auth_headers(1),
        json={"refrigerator_ids": [10]})
    assert response.status_code == 200
    view = (await transactional_client.get(f'/api/v1/recipes/{response.json()["plan_id"]}/cooking', headers=auth_headers(1))).json()
    assert view["requirements"][0]["quantity"] == .25
    assert any(s["quantity"] == .1 and s["ingredient_id"] == 1000 for s in view["suggestions"])
    assert any(s["quantity"] is None and "재고 부족" in s["message"] for s in view["suggestions"])
    assert before == await snapshot(inventory_sessions)
