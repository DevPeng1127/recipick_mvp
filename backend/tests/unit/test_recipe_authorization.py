from uuid import UUID
from app.schemas.recipe import GeneratedRecipe
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.dependencies.auth import get_current_user
from app.main import app
from app.models.refrigerator import MemberRole, Refrigerator, RefrigeratorMember
from app.models.user import User
from app.services import recipe_service
from tests.factories import make_ingredient
from app.services.recipe_usage import RecipeRateLimitError


@pytest.fixture
def recipe_context(monkeypatch):
    # Execute membership SQL against real rows without touching a configured DB.
    engine = create_engine("sqlite:///:memory:")
    for table in (User.__table__, Refrigerator.__table__, RefrigeratorMember.__table__):
        table.create(engine)

    with Session(engine) as session:
        session.add_all([
            User(id=1, oauth_provider="google", oauth_id="caller", nickname="Caller"),
            User(id=2, oauth_provider="google", oauth_id="other", nickname="Other"),
            Refrigerator(id=10, name="Owned"),
            Refrigerator(id=11, name="Shared"),
            Refrigerator(id=20, name="Other user's refrigerator"),
        ])
        session.flush()
        session.add_all([
            RefrigeratorMember(refrigerator_id=10, user_id=1, role=MemberRole.OWNER),
            RefrigeratorMember(refrigerator_id=11, user_id=1, role=MemberRole.GUEST),
            RefrigeratorMember(refrigerator_id=11, user_id=2, role=MemberRole.OWNER),
            RefrigeratorMember(refrigerator_id=20, user_id=2, role=MemberRole.OWNER),
        ])
        session.commit()

        db = AsyncMock(spec=AsyncSession)
        db.execute.side_effect = session.execute
        ingredients = AsyncMock(return_value=[make_ingredient()])
        preference = AsyncMock(return_value=None)
        ai = AsyncMock(return_value=GeneratedRecipe(title="Test recipe", recipe="Test recipe",
            requirements=[{"ingredient_name": "두부", "quantity": 1, "unit": "개"}]))
        plans = AsyncMock(return_value=SimpleNamespace(id=UUID("00000000-0000-0000-0000-000000000001")))
        monkeypatch.setattr(recipe_service, "create_plan", plans)
        monkeypatch.setattr(recipe_service, "list_ingredients_by_refrigerator", ingredients)
        monkeypatch.setattr(recipe_service, "get_user_preference", preference)
        monkeypatch.setattr(recipe_service, "run_recipe_graph", ai)
        yield SimpleNamespace(
            db=db, user=session.get(User, 1), ingredients=ingredients,
            preference=preference, ai=ai,
        )
    engine.dispose()


@pytest.fixture
async def recipe_client(recipe_context):
    async def override_get_db():
        yield recipe_context.db

    async def override_get_current_user():
        return recipe_context.user

    previous_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


@pytest.mark.parametrize("refrigerator_ids", [
    [20], [10, 20], [20, 10], [999], [10, 999], [20, 20],
])
async def test_rejects_entire_request_before_reading_ingredients(
    refrigerator_ids, recipe_client, recipe_context
):
    response = await recipe_client.post(
        "/api/v1/recipes/recommend", json={"refrigerator_ids": refrigerator_ids}
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Not a member of one or more requested refrigerators"}
    recipe_context.ingredients.assert_not_awaited()
    recipe_context.preference.assert_not_awaited()
    recipe_context.ai.assert_not_awaited()


@pytest.mark.parametrize("refrigerator_ids", [[10], [11], [10, 11], [10, 10]])
async def test_allows_owned_and_shared_refrigerators(
    refrigerator_ids, recipe_client, recipe_context
):
    response = await recipe_client.post(
        "/api/v1/recipes/recommend", json={"refrigerator_ids": refrigerator_ids}
    )

    assert response.status_code == 200
    assert response.json() == {"recipe": "Test recipe", "plan_id": "00000000-0000-0000-0000-000000000001"}
    assert {
        call.args[0] for call in recipe_context.ingredients.await_args_list
    } == set(refrigerator_ids)
    recipe_context.ai.assert_awaited_once()
    assert recipe_context.ai.await_args.kwargs == {"user_id": 1, "servings": 1}
    recipe_context.db.commit.assert_awaited_once()


async def test_service_itself_rejects_non_member(recipe_context):
    with pytest.raises(PermissionError):
        await recipe_service.recommend_recipe([10, 20], 1, recipe_context.db)

    recipe_context.ingredients.assert_not_awaited()
    recipe_context.ai.assert_not_awaited()


async def test_rate_limit_response_contains_safe_retry_details(recipe_client, recipe_context):
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    recipe_context.ai.side_effect = RecipeRateLimitError(
        "user_minute_limit", "잠시 후 다시 시도해 주세요.",
        now=now, retry_at=now + timedelta(seconds=30),
    )
    response = await recipe_client.post(
        "/api/v1/recipes/recommend", json={"refrigerator_ids": [10]}
    )
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "30"
    assert response.json()["detail"]["code"] == "user_minute_limit"
    assert response.json()["detail"]["retry_at"] == (now + timedelta(seconds=30)).isoformat()


async def test_empty_fridge_does_not_enter_ai_or_usage_limiter(recipe_client, recipe_context):
    recipe_context.ingredients.return_value = []
    response = await recipe_client.post(
        "/api/v1/recipes/recommend", json={"refrigerator_ids": [10]}
    )
    assert response.status_code == 200
    recipe_context.ai.assert_not_awaited()
    recipe_context.db.commit.assert_not_awaited()


async def test_empty_selection_preserves_existing_response(recipe_client, recipe_context):
    response = await recipe_client.post(
        "/api/v1/recipes/recommend", json={"refrigerator_ids": []}
    )

    assert response.status_code == 200
    assert response.json() == {
        "recipe": "선택한 냉장고에 식재료가 없습니다. 식재료를 먼저 등록해주세요."
    }
    recipe_context.ingredients.assert_not_awaited()
    recipe_context.ai.assert_not_awaited()
