from datetime import date, timedelta

from app.ai.prompts import build_recipe_prompt
from tests.factories import make_ingredient, make_user_preference


class TestBuildRecipePrompt:
    def test_basic_prompt_without_preference(self):
        ingredients = [
            make_ingredient(name="두부", quantity=1, expiry_date=date.today() + timedelta(days=2)),
            make_ingredient(name="계란", quantity=6, expiry_date=date.today() + timedelta(days=10)),
        ]

        prompt = build_recipe_prompt(ingredients, None)

        assert "두부" in prompt
        assert "계란" in prompt
        assert "우선 사용" in prompt  # 2일 남음 = 우선 사용

    def test_prompt_with_preference(self):
        ingredients = [
            make_ingredient(name="삼겹살", quantity=1),
        ]
        preference = make_user_preference(
            cooking_skill="MEDIUM",
            max_time=30,
            allergies=["땅콩"],
            cooking_tools=["프라이팬"],
        )

        prompt = build_recipe_prompt(ingredients, preference)

        assert "삼겹살" in prompt
        assert "중급" in prompt
        assert "30분" in prompt
        assert "땅콩" in prompt
        assert "프라이팬" in prompt

    def test_expired_ingredient(self):
        ingredients = [
            make_ingredient(name="우유", expiry_date=date.today() - timedelta(days=2)),
        ]

        prompt = build_recipe_prompt(ingredients, None)

        assert "지남" in prompt
