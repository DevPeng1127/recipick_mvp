import pytest
from pydantic import ValidationError

from app.ai.prompts import build_recipe_prompt
from app.schemas.recipe import CookingStock, GeneratedRecipe, RecipeRecommendRequest
from app.services.cooking_service import conversion, suggestions
from tests.factories import make_ingredient


def stock(id=1, quantity=1, unit="kg", expiry="2026-12-01", name="당근"):
    return CookingStock(ingredient_id=id, name=name, quantity=quantity, unit=unit, expiry_date=expiry,
                        refrigerator_id=10, refrigerator_name="냉장고", storage_box_name="채소칸", token="a"*64)


@pytest.mark.parametrize("source,target,expected", [("g", "kg", .001), ("kg", "g", 1000),
    ("ml", "L", .001), ("L", "ml", 1000), ("개", "개", 1), ("개", "g", None),
    ("큰술", "ml", None), ("약간", "약간", None), (None, "개", None)])
def test_only_explicit_unit_conversions(source, target, expected):
    result = conversion(source, target)
    assert (float(result) if result is not None else None) == expected


def test_allocates_across_stock_in_expiry_order_with_units():
    rows = suggestions([dict(ingredient_name="당근", quantity=1500, unit="g")],
                       [stock(1, 1, "kg"), stock(2, 800, "g")])
    assert [(r.ingredient_id, r.quantity) for r in rows] == [(1, 1), (2, 500)]


@pytest.mark.parametrize("quantity,unit", [(None, "개"), (1, "개"), (1, "약간")])
def test_ambiguous_units_or_quantity_require_manual_review(quantity, unit):
    row = suggestions([dict(ingredient_name="당근", quantity=quantity, unit=unit)], [stock()])[0]
    assert row.ingredient_id == 1 and row.quantity is None and row.message


def test_shortage_is_not_silently_dropped():
    rows = suggestions([dict(ingredient_name="당근", quantity=2, unit="kg")], [stock()])
    assert any(row.ingredient_id is None and row.message for row in rows)
    assert sum(row.quantity or 0 for row in rows) == 1


def test_prompt_keeps_real_units_identifiers_and_servings():
    ingredient = make_ingredient(name="두부", quantity=300, unit="g")
    ingredient.id = 12
    prompt = build_recipe_prompt([ingredient], None, 1)
    assert "300g" in prompt and "300개" not in prompt and "재고 #12" in prompt
    assert "1인분" in prompt and "requirements" in prompt


@pytest.mark.parametrize("servings", [0, 9, 1.5, True])
def test_invalid_servings_rejected(servings):
    with pytest.raises(ValidationError):
        RecipeRecommendRequest(refrigerator_ids=[10], servings=servings)


def test_default_servings_is_one():
    assert RecipeRecommendRequest(refrigerator_ids=[10]).servings == 1


def test_ai_invalid_json_or_negative_quantity_is_rejected():
    for raw in ['not-json', '{"title":"요리","recipe":"본문","requirements":[{"ingredient_name":"당근","quantity":-1,"unit":"kg"}]}']:
        with pytest.raises(ValidationError):
            GeneratedRecipe.model_validate_json(raw)
