"""Linked AI menu -> persisted plan -> review -> stock/log transaction."""
import json
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
import httpx
from pydantic import SecretStr
from sqlalchemy import select

from app.ai import recipe_graph
from app.models.cooking_plan import CookingPlan
from app.models.recipe_usage import RecipeUsageAttempt
from tests.integration.test_consume_dispose import (
    auth_headers, inventory_sessions, snapshot, transactional_client,  # noqa: F401
)


def linked_menu():
    return {
        "requirements": [{"ingredient_name": "당근", "quantity": 500, "unit": "g"}],
        "dishes": [{"main_ingredients": [0], "method": "찜", "steps": ["{0}을 썰어 찜기에 익히세요."]}],
        "notes": "당근을 우선 활용했습니다.",
    }


async def test_real_graph_plan_preview_deduction_reload_and_repeat_share_one_menu(
    transactional_client, inventory_sessions, monkeypatch,
):
    ai = AsyncMock(return_value=json.dumps(linked_menu(), ensure_ascii=False))
    monkeypatch.setattr(recipe_graph, "call_gemini", ai)
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post('/api/v1/recipes/recommend', headers=auth_headers(1),
        json={"refrigerator_ids": [10], "servings": 2, "priority_ingredient_ids": [1000]})
    assert response.status_code == 200, response.text
    plan_id = response.json()["plan_id"]
    view = (await transactional_client.get(f'/api/v1/recipes/{plan_id}/cooking', headers=auth_headers(1))).json()
    assert view["title"] == "당근 찜"
    assert view["recipe"] == response.json()["recipe"]
    assert "2인분 전체 사용량" in view["recipe"] and "당근: 500g" in view["recipe"]
    assert "당근을 썰어 찜기에 익히세요." in view["recipe"]
    assert view["requirements"] == linked_menu()["requirements"]
    assert view["suggestions"][0]["quantity"] == 0.5
    assert before == await snapshot(inventory_sessions)
    body = {"items": [{"ingredient_id": 1000, "quantity": .5, "expected_token": view["stock"][0]["token"]}]}
    consumed = await transactional_client.post(f'/api/v1/recipes/{plan_id}/consume', headers=auth_headers(1), json=body)
    assert consumed.status_code == 200
    after = await snapshot(inventory_sessions)
    assert after["ingredients"][0]["quantity"] == 5
    assert after["logs"][-1]["quantity"] == .5 and "당근 찜 (2인분)" in after["logs"][-1]["memo"]
    reloaded = (await transactional_client.get(f'/api/v1/recipes/{plan_id}/cooking', headers=auth_headers(1))).json()
    assert reloaded["recipe"] == view["recipe"] and reloaded["applied_at"]
    repeated = await transactional_client.post(f'/api/v1/recipes/{plan_id}/repeat', headers=auth_headers(1))
    assert repeated.status_code == 201 and repeated.json()["recipe"] == view["recipe"]
    assert ai.await_count == 1
    async with inventory_sessions() as db:
        plan = await db.get(CookingPlan, UUID(repeated.json()["plan_id"]))
        assert plan.title == view["title"] and plan.requirements == view["requirements"]


@pytest.mark.parametrize("failure", ["legacy", "unused", "title", "quantity", "reference", "duplicate", "pantry"])
async def test_inconsistent_ai_result_is_not_saved_or_retried(
    transactional_client, inventory_sessions, monkeypatch, caplog, failure,
):
    draft = linked_menu()
    if failure == "legacy":
        draft = {"title": "당근 달걀 볶음밥", "recipe": "당근을 볶으세요.", "requirements": draft["requirements"]}
    elif failure == "unused":
        draft["requirements"].append({"ingredient_name": "달걀", "quantity": 1, "unit": "개"})
    elif failure == "title":
        draft["dishes"][0]["main_ingredients"] = [2]
    elif failure == "quantity":
        draft["dishes"][0]["steps"] = ["{0} 700g을 익히세요."]
    elif failure == "reference":
        draft["dishes"][0]["steps"] = ["{0}과 {1}을 익히세요."]
    elif failure == "duplicate":
        draft["requirements"].append({"ingredient_name": "당 근", "quantity": 1, "unit": "개"})
    elif failure == "pantry":
        draft["dishes"][0]["steps"] = ["팬에 기름을 두르고 {0}을 볶으세요."]
    draft["notes"] = "private-provider-content"
    ai = AsyncMock(return_value=json.dumps(draft, ensure_ascii=False))
    monkeypatch.setattr(recipe_graph, "call_gemini", ai)
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post('/api/v1/recipes/recommend', headers=auth_headers(1),
        json={"refrigerator_ids": [10]})
    assert response.status_code == 502 and response.json()["detail"]["code"] == "inconsistent_menu"
    assert "private-provider-content" not in response.text + caplog.text
    assert before == await snapshot(inventory_sessions)
    async with inventory_sessions() as db:
        assert (await db.execute(select(CookingPlan))).scalars().all() == []
    assert ai.await_count == 1


async def test_no_usable_food_from_real_graph_does_not_create_plan(transactional_client, inventory_sessions, monkeypatch):
    ai = AsyncMock(return_value=json.dumps({"requirements": [], "dishes": [], "notes": "활용할 재료가 없습니다."}))
    monkeypatch.setattr(recipe_graph, "call_gemini", ai)
    response = await transactional_client.post('/api/v1/recipes/recommend', headers=auth_headers(1),
        json={"refrigerator_ids": [10]})
    assert response.status_code == 200 and "plan_id" not in response.json()
    async with inventory_sessions() as db:
        assert (await db.execute(select(CookingPlan))).scalars().all() == []
    assert ai.await_count == 1


async def test_rejected_response_keeps_exactly_one_finished_usage_reservation(
    transactional_client, inventory_sessions, monkeypatch,
):
    from app.ai import gemini_client

    client_type = httpx.AsyncClient
    requests = []
    draft = linked_menu()
    draft["dishes"][0]["steps"] = ["{9}을 조리하세요."]

    def handle(request):
        requests.append(request)
        return httpx.Response(200, json={"candidates": [{"finishReason": "STOP", "content": {
            "parts": [{"text": json.dumps(draft)}],
        }}]})

    monkeypatch.setattr(gemini_client.settings, "GEMINI_API_KEY", SecretStr("synthetic-test-key"))
    monkeypatch.setattr(gemini_client.recipe_usage_limiter, "session_factory", inventory_sessions)
    monkeypatch.setattr(gemini_client.httpx, "AsyncClient",
                        lambda **kwargs: client_type(transport=httpx.MockTransport(handle), **kwargs))
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post('/api/v1/recipes/recommend', headers=auth_headers(1),
        json={"refrigerator_ids": [10]})
    assert response.status_code == 502
    assert len(requests) == 1
    async with inventory_sessions() as db:
        attempts = (await db.execute(select(RecipeUsageAttempt))).scalars().all()
        assert len(attempts) == 1 and attempts[0].finished_at is not None
        assert (await db.execute(select(CookingPlan))).scalars().all() == []
    assert before == await snapshot(inventory_sessions)
