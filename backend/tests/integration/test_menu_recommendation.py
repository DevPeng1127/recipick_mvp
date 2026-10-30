from datetime import timedelta
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.ai.prompts import today_kst
from app.models.cooking_plan import CookingPlan
from app.models.ingredient import Ingredient
from app.models.refrigerator import RefrigeratorMember
from app.schemas.recipe import GeneratedRecipe
from app.services import recipe_service
from tests.integration.test_consume_dispose import (
    auth_headers, inventory_sessions, snapshot, transactional_client,  # noqa: F401
)


@pytest.fixture
def menu_ai(monkeypatch):
    ai = AsyncMock(return_value=GeneratedRecipe(title="당근 메뉴", recipe="당근을 간단히 조리합니다.",
        requirements=[{"ingredient_name": "당근", "quantity": 100, "unit": "g"}]))
    monkeypatch.setattr(recipe_service, "run_recipe_graph", ai)
    return ai


@pytest.mark.parametrize("user", [1, 2])
async def test_inventory_is_authorized_read_only_and_keeps_provenance(transactional_client, inventory_sessions, menu_ai, user):
    async with inventory_sessions.begin() as db:
        item = await db.get(Ingredient, 1000)
        item.expiry_date, item.expiry_source = today_kst(), "estimated"
    before = await snapshot(inventory_sessions)
    response = await transactional_client.get('/api/v1/recipes/ingredients?refrigerator_ids=10', headers=auth_headers(user))
    assert response.status_code == 200
    body = response.json()
    assert body['as_of'] == today_kst().isoformat()
    assert body['ingredients'] == [dict(ingredient_id=1000, name="당근", quantity=5.5, unit="kg",
        expiry_date=today_kst().isoformat(), expiry_source="estimated", refrigerator_id=10,
        refrigerator_name="우리 냉장고", storage_box_name="채소칸")]
    assert before == await snapshot(inventory_sessions)
    menu_ai.assert_not_awaited()


@pytest.mark.parametrize("query,user", [("refrigerator_ids=10&refrigerator_ids=20", 1), ("refrigerator_ids=10", 3), ("refrigerator_ids=999", 1)])
async def test_inventory_rejects_entire_foreign_scope(transactional_client, menu_ai, query, user):
    response = await transactional_client.get('/api/v1/recipes/ingredients?' + query, headers=auth_headers(user))
    assert response.status_code == 403
    assert 'ingredients' not in response.json()
    menu_ai.assert_not_awaited()


@pytest.mark.parametrize("user", [1, 2])
async def test_priority_reaches_ai_without_consuming_stock(transactional_client, inventory_sessions, menu_ai, user):
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post('/api/v1/recipes/recommend', headers=auth_headers(user),
        json={"refrigerator_ids": [10], "servings": 2, "priority_ingredient_ids": [1000]})
    assert response.status_code == 200 and response.json()['plan_id']
    assert menu_ai.await_args.kwargs == dict(user_id=user, servings=2, priority_ingredient_ids=[1000])
    assert before == await snapshot(inventory_sessions)


@pytest.mark.parametrize("item_id", [2000, 9999])
async def test_foreign_or_missing_priority_stops_before_ai(transactional_client, inventory_sessions, menu_ai, item_id):
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post('/api/v1/recipes/recommend', headers=auth_headers(1),
        json={"refrigerator_ids": [10], "priority_ingredient_ids": [item_id]})
    assert response.status_code == 409
    menu_ai.assert_not_awaited()
    assert before == await snapshot(inventory_sessions)


async def test_priority_that_expired_since_list_is_rejected(transactional_client, inventory_sessions, menu_ai):
    async with inventory_sessions.begin() as db:
        (await db.get(Ingredient, 1000)).expiry_date = today_kst() - timedelta(days=1)
    response = await transactional_client.post('/api/v1/recipes/recommend', headers=auth_headers(1),
        json={"refrigerator_ids": [10], "priority_ingredient_ids": [1000]})
    assert response.status_code == 409 and '기한' in response.json()['detail']
    menu_ai.assert_not_awaited()


async def test_removed_membership_cannot_use_old_inventory_selection(transactional_client, inventory_sessions, menu_ai):
    assert (await transactional_client.get('/api/v1/recipes/ingredients?refrigerator_ids=10', headers=auth_headers(2))).status_code == 200
    async with inventory_sessions.begin() as db:
        member = await db.scalar(select(RefrigeratorMember).where(RefrigeratorMember.user_id == 2))
        await db.delete(member)
    response = await transactional_client.post('/api/v1/recipes/recommend', headers=auth_headers(2),
        json={"refrigerator_ids": [10], "priority_ingredient_ids": [1000]})
    assert response.status_code == 403
    menu_ai.assert_not_awaited()


async def test_no_usable_food_returns_guidance_without_a_consumption_plan(transactional_client, inventory_sessions, menu_ai):
    menu_ai.return_value = GeneratedRecipe(title="재료 확인 필요", recipe="현재 재료로는 식사를 구성하기 어렵습니다.", requirements=[])
    before = await snapshot(inventory_sessions)
    response = await transactional_client.post('/api/v1/recipes/recommend', headers=auth_headers(1), json={"refrigerator_ids": [10]})
    assert response.status_code == 200 and 'plan_id' not in response.json()
    async with inventory_sessions() as db:
        assert (await db.execute(select(CookingPlan))).scalars().all() == []
    assert before == await snapshot(inventory_sessions)


@pytest.mark.parametrize("priorities", [[1000, 1000], [0], [-1], [True], ["1000"], list(range(1, 32)), None])
async def test_bad_priority_payload_never_calls_ai(transactional_client, menu_ai, priorities):
    response = await transactional_client.post('/api/v1/recipes/recommend', headers=auth_headers(1),
        json={"refrigerator_ids": [10], "priority_ingredient_ids": priorities})
    assert response.status_code == 422
    menu_ai.assert_not_awaited()
