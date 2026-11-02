"""The app's 250 mL beverage cap is not a general dietary serving standard."""
import json

import pytest

from app.ai.menu import MenuConsistencyError, compile_menu


def beverage_menu(name="크랜베리 주스", quantity=1, unit="L"):
    return {
        "requirements": [{"ingredient_name": name, "quantity": quantity, "unit": unit}],
        "dishes": [{"main_ingredients": [0], "method": "곁들이기",
                    "steps": ["{0}를 컵에 따라 곁들여 마시세요."]}],
        "notes": "제품 표시사항을 확인하세요.",
    }


def compile(draft, servings=1):
    return compile_menu(json.dumps(draft, ensure_ascii=False), servings=servings,
                        inventory_names=[n["ingredient_name"] for n in draft["requirements"]])


def test_one_litre_juice_is_capped_in_both_recipe_and_deduction():
    menu = compile(beverage_menu())
    assert menu.requirements[0].quantity == .25
    assert menu.requirements[0].unit == "L"
    assert "크랜베리 주스: 0.25L" in menu.recipe
    assert "1인분 250mL" in menu.recipe and "총 250mL로 보정" in menu.recipe
    assert "실제 마신 양" in menu.recipe


@pytest.mark.parametrize("servings,quantity,unit,expected", [
    (2, 1, "L", .5), (4, 2, "L", 1), (8, 3, "L", 2),
    (1, 1000, "ml", 250), (2, 1500, "mL", 500), (1, 2, " l ", .25),
])
def test_cap_scales_with_servings_and_normalizes_only_known_volume_units(servings, quantity, unit, expected):
    menu = compile(beverage_menu(quantity=quantity, unit=unit), servings)
    assert menu.requirements[0].quantity == expected
    assert menu.requirements[0].unit in {"L", "ml"}


@pytest.mark.parametrize("quantity,unit", [(200, "ml"), (250, "ml"), (.2, "L"),
    (1, "병"), (2, "팩"), (500, "g"), (1, "컵"), (None, "ml"), (1000, None)])
def test_smaller_portions_and_unknown_package_volumes_are_not_invented(quantity, unit):
    menu = compile(beverage_menu(quantity=quantity, unit=unit))
    assert (menu.requirements[0].quantity, menu.requirements[0].unit) == (quantity, unit)
    assert "보정했습니다" not in menu.recipe


@pytest.mark.parametrize("name", ["오렌지 주스", "포도쥬스", "제로 콜라", "사이다", "과채음료", "이온음료"])
def test_recognizable_ready_to_drink_beverages(name):
    assert compile(beverage_menu(name)).requirements[0].quantity == .25


@pytest.mark.parametrize("name", ["주스 농축액", "농축 오렌지 주스", "오렌지 주스 베이스", "칵테일 주스",
    "과일 시럽", "와인", "맥주", "소주", "영아용 주스", "단백질 주스", "주스맛 젤리", "소스", "정체 모를 제품"])
def test_concentrates_alcohol_special_foods_and_unknown_names_are_not_capped(name):
    menu = compile(beverage_menu(name))
    assert menu.requirements[0].quantity == 1
    assert "보정했습니다" not in menu.recipe


@pytest.mark.parametrize("method,step", [("끓이기", "{0}를 끓여 소스를 만드세요."),
    ("곁들이기", "{0}를 희석해서 마시세요."), ("담아내기", "{0}를 섞어 소스를 만드세요.")])
def test_preparation_and_mixing_are_not_drinking_portions(method, step):
    draft = beverage_menu()
    draft["dishes"][0].update(method=method, steps=[step])
    assert compile(draft).requirements[0].quantity == 1


def test_beverage_also_used_for_cooking_is_not_capped_as_a_whole():
    draft = beverage_menu()
    draft["dishes"].append({"main_ingredients": [0], "method": "끓이기", "steps": ["{0}를 끓이세요."]})
    assert compile(draft).requirements[0].quantity == 1


def test_separate_juice_with_pizza_reference_is_capped_without_changing_pizza():
    draft = beverage_menu()
    draft["requirements"].append({"ingredient_name": "냉동 피자", "quantity": 1, "unit": "개"})
    draft["dishes"][0]["steps"] = ["{0}를 컵에 따라 {1}와 곁들여 드세요."]
    draft["dishes"].append({"main_ingredients": [1], "method": "데우기", "steps": ["{1}를 제품 표시대로 데우세요."]})
    menu = compile(draft)
    assert [n.quantity for n in menu.requirements] == [.25, 1]


def test_repeated_serving_steps_do_not_multiply_the_cap():
    draft = beverage_menu()
    draft["dishes"].append(draft["dishes"][0].copy())
    assert compile(draft, 2).requirements[0].quantity == .5


def test_portion_cap_never_rescues_an_inconsistent_response():
    draft = beverage_menu()
    draft["dishes"][0]["steps"] = ["{0}를 1L 마시세요."]
    with pytest.raises(MenuConsistencyError):
        compile(draft)
