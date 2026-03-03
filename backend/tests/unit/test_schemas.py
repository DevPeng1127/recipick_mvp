import pytest
from datetime import date
from pydantic import ValidationError

from app.schemas.user import UserUpdate
from app.schemas.ingredient import IngredientCreate, IngredientUpdate, IngredientResponse
from app.schemas.refrigerator import RefrigeratorListResponse


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
        assert schema.quantity == 2

    def test_update_unit_optional(self):
        schema = IngredientUpdate(unit="kg")
        assert schema.unit == "kg"
        assert schema.name is None

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
        assert schema.name == "당근"


class TestRefrigeratorListResponse:
    def test_serializes_with_empty_storage_boxes(self):
        schema = RefrigeratorListResponse(
            id=1,
            name="우리집 냉장고",
            created_at="2026-01-01T00:00:00",
            storage_boxes=[],
        )
        assert schema.storage_boxes == []

    def test_serializes_with_storage_boxes(self):
        schema = RefrigeratorListResponse(
            id=1,
            name="우리집 냉장고",
            created_at="2026-01-01T00:00:00",
            storage_boxes=[
                {"id": 1, "refrigerator_id": 1, "name": "야채칸", "type": "FRIDGE"},
            ],
        )
        assert len(schema.storage_boxes) == 1
        assert schema.storage_boxes[0].name == "야채칸"
