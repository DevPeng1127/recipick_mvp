from datetime import datetime, timedelta, timezone

from app.ai import prompts
from app.schemas.recipe import CookingStock
from app.services.cooking_service import suggestions
from tests.factories import make_ingredient, make_user_preference


def test_prompt_preserves_food_identity_and_marks_only_selected_stock():
    pizza = make_ingredient(name="냉동 피자", quantity=1, unit="개")
    juice = make_ingredient(name="크랜베리 주스", quantity=1000, unit="ml")
    pizza.id, juice.id = 10, 11
    text = prompts.build_recipe_prompt([pizza, juice], make_user_preference(allergies=["땅콩"]), 2, [11])
    lines = [line for line in text.splitlines() if line.startswith('- 재고 #')]
    assert '[사용자가 우선 활용 선택]' not in lines[0]
    assert '[사용자가 우선 활용 선택]' in lines[1] and '1000ml' in lines[1]
    assert '2인분 메뉴 구성 하나' in text
    assert '완제품은 완제품으로 유지' in text and '별도 메뉴·곁들임' in text
    assert '제외 이유를 반드시 설명' in text and '빈 배열' in text
    assert '알레르기·제외 재료는 사용자 선택이나 임박 기한보다 우선' in text


def test_korean_day_boundary_and_expired_estimate_are_not_treated_as_product_deadline(monkeypatch):
    class Clock:
        @classmethod
        def now(cls, tz):
            return datetime(2026, 10, 29, 15, 1, tzinfo=timezone.utc).astimezone(tz)
    monkeypatch.setattr(prompts, 'datetime', Clock)
    assert prompts.today_kst().isoformat() == '2026-10-30'
    item = make_ingredient(name="당근", expiry_date=prompts.today_kst() - timedelta(days=1))
    item.id, item.expiry_source = 12, 'estimated'
    text = prompts.build_recipe_prompt([item], None, priority_ingredient_ids=[12])
    line = next(line for line in text.splitlines() if line.startswith('- 재고 #'))
    assert '추정 사용 권장일 1일 지남' in line and '추천 사용 대상에서 제외' in line


def test_deduction_does_not_auto_select_past_date_stock_of_same_name():
    common = dict(name='당근', quantity=1, unit='kg', refrigerator_id=1,
        refrigerator_name='냉장고', storage_box_name='칸', token='a'*64)
    old = CookingStock(ingredient_id=1, expiry_date=prompts.today_kst()-timedelta(days=1), **common)
    fresh = CookingStock(ingredient_id=2, expiry_date=prompts.today_kst()+timedelta(days=2), **common)
    result = suggestions([dict(ingredient_name='당근', quantity=500, unit='g')], [old, fresh])
    assert [(item.ingredient_id, item.quantity) for item in result] == [(2, .5)]
