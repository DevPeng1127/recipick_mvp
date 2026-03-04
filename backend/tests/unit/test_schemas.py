import pytest
from datetime import date
from pydantic import ValidationError

from app.schemas.user import UserUpdate
from app.schemas.ingredient import (
    IngredientCreate,
    IngredientUpdate,
    IngredientResponse,
    IngredientBriefResponse,
    IngredientSearchResult,
)
from app.schemas.refrigerator import RefrigeratorListResponse, ReorderRequest
from app.schemas.recipe import RecipeRecommendRequest


class TestUserUpdate:
    def test_valid_nickname_korean(self):
        schema = UserUpdate(nickname="테스트유저")
        assert schema.nickname == "테스트유저"

    def test_valid_nickname_english(self):
        schema = UserUpdate(nickname="testUser123")
        assert schema.nickname == "testUser123"

    def test_valid_nickname_with_special_chars(self):
        schema = UserUpdate(nickname="유저-이름_test(1)")
        assert schema.nickname == "유저-이름_test(1)"

    def test_invalid_nickname_with_spaces(self):
        with pytest.raises(ValidationError):
            UserUpdate(nickname="test user")

    def test_invalid_nickname_with_special_symbols(self):
        with pytest.raises(ValidationError):
            UserUpdate(nickname="user@name!")

    def test_invalid_nickname_too_long(self):
        with pytest.raises(ValidationError):
            UserUpdate(nickname="a" * 21)

    def test_invalid_nickname_empty(self):
        with pytest.raises(ValidationError):
            UserUpdate(nickname="")


class TestIngredientSchemas:
    def test_create_default_unit(self):
        schema = IngredientCreate(name="두부")
        assert schema.unit == "개"
        assert schema.quantity == 1

    def test_create_custom_unit(self):
        schema = IngredientCreate(name="우유", quantity=2, unit="L")
        assert schema.unit == "L"
        assert schema.quantity == 2.0

    def test_create_decimal_quantity(self):
        schema = IngredientCreate(name="계란", quantity=0.5, unit="판")
        assert schema.quantity == 0.5

    def test_update_unit_optional(self):
        schema = IngredientUpdate(unit="kg")
        assert schema.unit == "kg"
        assert schema.name is None

    def test_update_decimal_quantity(self):
        schema = IngredientUpdate(quantity=1.5)
        assert schema.quantity == 1.5

    def test_response_includes_unit(self):
        schema = IngredientResponse(
            id=1,
            storage_box_id=1,
            name="당근",
            quantity=3,
            unit="개",
            expiry_date=date.today(),
        )
        assert schema.unit == "개"
        assert schema.quantity == 3.0
        assert schema.name == "당근"

    def test_response_decimal_quantity(self):
        schema = IngredientResponse(
            id=2,
            storage_box_id=1,
            name="우유",
            quantity=0.5,
            unit="L",
        )
        assert schema.quantity == 0.5


class TestRefrigeratorListResponse:
    def test_serializes_with_empty_ingredients(self):
        schema = RefrigeratorListResponse(
            id=1,
            name="우리집 냉장고",
            created_at="2026-01-01T00:00:00",
            top_ingredients=[],
            total_ingredient_count=0,
        )
        assert schema.top_ingredients == []
        assert schema.total_ingredient_count == 0

    def test_serializes_with_top_ingredients(self):
        schema = RefrigeratorListResponse(
            id=1,
            name="우리집 냉장고",
            created_at="2026-01-01T00:00:00",
            top_ingredients=[
                {"name": "시금치", "expiry_date": "2026-03-06"},
                {"name": "두부", "expiry_date": None},
            ],
            total_ingredient_count=15,
        )
        assert len(schema.top_ingredients) == 2
        assert schema.top_ingredients[0].name == "시금치"
        assert schema.top_ingredients[0].expiry_date == date(2026, 3, 6)
        assert schema.total_ingredient_count == 15

    def test_serializes_with_is_favorite_true(self):
        schema = RefrigeratorListResponse(
            id=1,
            name="즐겨찾는 냉장고",
            created_at="2026-01-01T00:00:00",
            is_favorite=True,
            top_ingredients=[],
            total_ingredient_count=0,
        )
        assert schema.is_favorite is True

    def test_serializes_with_is_favorite_default(self):
        schema = RefrigeratorListResponse(
            id=1,
            name="일반 냉장고",
            created_at="2026-01-01T00:00:00",
        )
        assert schema.is_favorite is False


class TestReorderRequest:
    def test_accepts_ordered_ids(self):
        schema = ReorderRequest(ordered_ids=[3, 1, 2])
        assert schema.ordered_ids == [3, 1, 2]

    def test_accepts_empty_list(self):
        schema = ReorderRequest(ordered_ids=[])
        assert schema.ordered_ids == []


class TestRecipeRecommendRequest:
    def test_accepts_list_of_ids(self):
        schema = RecipeRecommendRequest(refrigerator_ids=[1, 2, 3])
        assert schema.refrigerator_ids == [1, 2, 3]

    def test_rejects_single_id(self):
        with pytest.raises(ValidationError):
            RecipeRecommendRequest(refrigerator_ids=1)

    def test_accepts_empty_list(self):
        schema = RecipeRecommendRequest(refrigerator_ids=[])
        assert schema.refrigerator_ids == []


class TestIngredientBriefResponse:
    def test_serializes_with_expiry(self):
        schema = IngredientBriefResponse(name="당근", expiry_date=date(2026, 3, 10))
        assert schema.name == "당근"
        assert schema.expiry_date == date(2026, 3, 10)

    def test_serializes_without_expiry(self):
        schema = IngredientBriefResponse(name="소금")
        assert schema.expiry_date is None


class TestIngredientSearchResult:
    def test_serializes(self):
        schema = IngredientSearchResult(
            ingredient_id=1,
            ingredient_name="연어",
            quantity=2,
            unit="팩",
            expiry_date=date(2026, 3, 5),
            storage_box_name="냉동실",
            storage_box_type="FREEZER",
            refrigerator_name="자취방 냉장고",
            refrigerator_id=1,
        )
        assert schema.ingredient_name == "연어"
        assert schema.storage_box_name == "냉동실"
        assert schema.refrigerator_name == "자취방 냉장고"
