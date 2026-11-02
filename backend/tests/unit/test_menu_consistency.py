"""Regressions for independently generated titles, instructions and deductions."""
import json
from copy import deepcopy

import pytest

from app.ai.recipe_graph import parse_response
from app.ai.menu import MenuConsistencyError, compile_menu


def vegetable_menu():
    return {
        "requirements": [
            {"ingredient_name": "당근", "quantity": 0.5, "unit": "개"},
            {"ingredient_name": "양파", "quantity": 0.5, "unit": "개"},
            {"ingredient_name": "식용유", "quantity": None, "unit": None},
            {"ingredient_name": "소금", "quantity": None, "unit": None},
        ],
        "dishes": [{"main_ingredients": [0, 1], "method": "볶음", "steps": [
            "{0}과 {1}를 썰어 {2}를 두른 팬에서 3분간 볶고 {3}으로 간하세요.",
        ]}],
        "notes": "당근을 우선 활용했습니다.",
    }


def compile(data, inventory=("당근", "양파"), servings=1):
    return compile_menu(json.dumps(data, ensure_ascii=False), servings=servings, inventory_names=list(inventory))


def test_same_source_builds_title_ingredients_instructions_and_deduction():
    menu = compile(vegetable_menu(), servings=2)
    assert menu.title == "당근·양파 볶음"
    assert "2인분 전체 사용량" in menu.recipe
    assert "당근: 0.5개" in menu.recipe and "양파: 0.5개" in menu.recipe
    assert "당근과 양파를 썰어 식용유를 두른 팬에서 3분간 볶고 소금으로 간하세요." in menu.recipe
    assert "식용유: 사용량 확인 필요 · 재고에 없음, 별도 준비 확인" in menu.recipe
    assert all(word not in menu.title for word in ("달걀", "볶음밥"))
    assert "{" not in menu.recipe and "}" not in menu.recipe
    assert [(need.ingredient_name, need.quantity, need.unit) for need in menu.requirements] == [
        ("당근", .5, "개"), ("양파", .5, "개"), ("식용유", None, None), ("소금", None, None),
    ]


@pytest.mark.parametrize("step", [
    "{0}과 {1}을 {2}에 볶고 {4}로 간하세요.",
    "{0}과 {1}을 {2}에 볶고 {-1}로 간하세요.",
    "{{0}}과 {1}을 {2}에 볶고 {3}으로 간하세요.",
    "{0} 2개와 {1}을 {2}에 볶고 {3}으로 간하세요.",
    "{0} 200g과 {1}을 {2}에 볶고 {3}으로 간하세요.",
    "{0} 반개와 {1}을 {2}에 볶고 {3}으로 간하세요.",
    "당근과 {1}을 {2}에 볶고 {3}으로 간하세요.",
    "{0}과 {1}을 {2}에 볶고 {3}과 달걀을 넣으세요.",
    " ",
])
def test_unknown_references_independent_amounts_or_unlinked_stock_are_rejected(step):
    draft = vegetable_menu()
    draft["dishes"][0]["steps"] = [step]
    with pytest.raises(MenuConsistencyError):
        compile(draft, inventory=("당근", "양파", "달걀"))


@pytest.mark.parametrize("mains", [[0, 0], [9], [True], ["0"], []])
def test_invalid_title_references_rejected(mains):
    draft = vegetable_menu()
    draft["dishes"][0]["main_ingredients"] = mains
    with pytest.raises(MenuConsistencyError):
        compile(draft)


def test_main_ingredient_must_be_used_in_its_own_dish_not_only_another_one():
    draft = vegetable_menu()
    draft["dishes"][0]["steps"] = ["{0}을 {2}에 볶고 {3}으로 간하세요."]
    draft["dishes"].append({"main_ingredients": [1], "method": "곁들이기", "steps": ["{1}을 곁들여 드세요."]})
    with pytest.raises(MenuConsistencyError, match="title_ingredient_not_used"):
        compile(draft)


def test_unused_deduction_item_and_duplicate_names_are_rejected():
    draft = vegetable_menu()
    draft["requirements"].append({"ingredient_name": "달걀", "quantity": 1, "unit": "개"})
    with pytest.raises(MenuConsistencyError, match="unused_deduction"):
        compile(draft)
    draft["requirements"][-1]["ingredient_name"] = "당 근"
    with pytest.raises(MenuConsistencyError, match="duplicate_ingredient"):
        compile(draft)


def test_same_ingredient_across_dishes_is_only_counted_once_and_in_total():
    draft = vegetable_menu()
    draft["dishes"].append({"main_ingredients": [0], "method": "곁들이기", "steps": ["{0}의 일부를 따로 곁들이세요."]})
    menu = compile(draft)
    assert menu.title == "당근·양파 볶음 + 당근 곁들이기"
    assert menu.recipe.count("당근: 0.5개") == 1
    assert len([item for item in menu.requirements if item.ingredient_name == "당근"]) == 1


def test_ready_made_food_and_drink_stay_separate_and_keep_exact_stock_names():
    menu = compile({
        "requirements": [
            {"ingredient_name": "냉동피자", "quantity": .5, "unit": "개"},
            {"ingredient_name": "크랜베리 주스", "quantity": 250, "unit": "ml"},
        ],
        "dishes": [
            {"main_ingredients": [0], "method": "데우기", "steps": ["{0}를 제품 포장의 조리 지침에 따라 데우세요."]},
            {"main_ingredients": [1], "method": "곁들이기", "steps": ["{1}를 잔에 담아 따로 곁들이세요."]},
        ], "notes": "제품에 적힌 성분과 조리 지침을 확인하세요.",
    }, inventory=("냉동 피자", "크랜베리 주스"))
    assert menu.title == "냉동 피자 데우기 + 크랜베리 주스 곁들이기"
    assert menu.requirements[0].ingredient_name == "냉동 피자"
    assert "크랜베리 주스: 250ml" in menu.recipe


def test_zero_food_has_explanation_and_no_deduction():
    result = compile({"requirements": [], "dishes": [], "notes": "현재 활용할 재료가 없습니다."})
    assert result.requirements == [] and result.title == "재료 확인 필요"
    for data in [
        {"requirements": [], "dishes": [], "notes": "  "},
        {**vegetable_menu(), "dishes": []},
        {**vegetable_menu(), "requirements": []},
    ]:
        with pytest.raises(MenuConsistencyError):
            compile(data)


def test_generated_title_is_bounded_without_losing_body_ingredient_names():
    draft = vegetable_menu()
    name = "아주 긴 제품명 " * 9
    draft["requirements"][0]["ingredient_name"] = name.strip()
    draft["requirements"][1]["ingredient_name"] = "양파 " * 20
    menu = compile(draft)
    assert len(menu.title) == 100 and menu.title.endswith("…")
    assert name.strip() in menu.recipe


def test_format_validation_never_exposes_raw_model_response():
    draft = deepcopy(vegetable_menu())
    draft["title"] = "private-provider-content"
    with pytest.raises(MenuConsistencyError) as exc:
        compile(draft)
    assert "private-provider-content" not in str(exc.value)


@pytest.mark.parametrize("notes", ["당근은 2개 사용합니다.", "{0}을 우선 사용했습니다."])
def test_notes_cannot_repeat_amounts_or_leak_internal_references(notes):
    draft = vegetable_menu()
    draft["notes"] = notes
    with pytest.raises(MenuConsistencyError):
        compile(draft)


def test_method_cannot_introduce_an_independently_named_dish():
    draft = vegetable_menu()
    draft["dishes"][0]["method"] = "달걀 볶음밥"
    with pytest.raises(MenuConsistencyError):
        compile(draft)


@pytest.mark.parametrize("addition", ["기름을 두르고", "식용유를 두르고", "버터를 녹여", "간장을 넣어", "달걀을 넣어"])
def test_unlisted_pantry_food_is_rejected_even_without_matching_inventory(addition):
    draft = vegetable_menu()
    draft["dishes"][0]["steps"].append(f"{addition} {{0}}을 볶으세요.")
    with pytest.raises(MenuConsistencyError, match="unlinked_pantry_ingredient"):
        compile(draft)


def test_live_rice_response_with_omitted_oil_cannot_be_saved():
    draft = {
        "requirements": [
            {"ingredient_name": "밥", "quantity": 2, "unit": "공기"},
            {"ingredient_name": "계란", "quantity": 2, "unit": "개"},
            {"ingredient_name": "대파", "quantity": 30, "unit": "g"},
        ],
        "dishes": [{"main_ingredients": [0, 1, 2], "method": "볶음", "steps": [
            "{2}를 송송 썰어 준비합니다.",
            "팬에 기름을 두르고 다듬은 {2}를 넣어 파기름을 냅니다.",
            "{1}을 넣은 뒤 {0}을 함께 볶습니다.",
        ]}], "notes": "",
    }
    with pytest.raises(MenuConsistencyError, match="unlinked_pantry_ingredient"):
        compile(draft, inventory=("밥", "계란", "대파"))
    draft["requirements"].append({"ingredient_name": "식용유", "quantity": None, "unit": None})
    draft["dishes"][0]["steps"][1] = "팬에 {3}를 두르고 다듬은 {2}를 넣어 파기름을 냅니다."
    assert compile(draft, inventory=("밥", "계란", "대파")).title == "밥·계란·대파 볶음"


def test_notes_cannot_hide_an_extra_pantry_suggestion_but_may_explain_excluded_stock():
    draft = vegetable_menu()
    draft["notes"] = "기호에 따라 간장을 추가하세요."
    with pytest.raises(MenuConsistencyError, match="unlisted_notes_ingredient"):
        compile(draft)
    draft["notes"] = "달걀은 이번 메뉴에서 제외했습니다."
    assert compile(draft, inventory=("당근", "양파", "달걀"))


def test_exact_stock_name_wins_and_ambiguous_whitespace_match_is_rejected():
    draft = vegetable_menu()
    draft["requirements"][0]["ingredient_name"] = "당 근"
    assert compile(draft, inventory=("당 근", "당근", "양파")).requirements[0].ingredient_name == "당 근"
    draft["requirements"][0]["ingredient_name"] = "당  근"
    with pytest.raises(MenuConsistencyError, match="ambiguous_stock_name"):
        compile(draft, inventory=("당 근", "당근", "양파"))


def test_free_text_contradiction_cannot_become_a_cooking_plan():
    # Minimal reproduction of the production response, without user preferences.
    raw = json.dumps({
        "title": "당근 양파 달걀 볶음과 볶음밥",
        "recipe": "당근 0.5개와 양파 0.5개를 썰어 식용유에 볶고 소금으로 간합니다.",
        "requirements": [
            {"ingredient_name": "당근", "quantity": 0.5, "unit": "개"},
            {"ingredient_name": "양파", "quantity": 0.5, "unit": "개"},
            {"ingredient_name": "식용유", "quantity": None, "unit": None},
            {"ingredient_name": "소금", "quantity": None, "unit": None},
        ],
    }, ensure_ascii=False)
    with pytest.raises(ValueError):
        parse_response({"raw_response": raw, "ingredients": [], "servings": 1})
