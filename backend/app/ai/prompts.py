from datetime import date

from app.models.ingredient import Ingredient
from app.models.user import UserPreference


def build_recipe_prompt(
    ingredients: list[Ingredient], preference: UserPreference | None
) -> str:
    today = date.today()

    ingredient_lines = []
    for ing in ingredients:
        days_left = ""
        if ing.expiry_date:
            delta = (ing.expiry_date - today).days
            if delta < 0:
                days_left = f" (유통기한 {abs(delta)}일 지남!)"
            elif delta == 0:
                days_left = " (오늘 만료!)"
            elif delta <= 3:
                days_left = f" (유통기한 {delta}일 남음 - 우선 사용)"
            else:
                days_left = f" (유통기한 {delta}일 남음)"
        ingredient_lines.append(f"- {ing.name} {ing.quantity}개{days_left}")

    ingredients_text = "\n".join(ingredient_lines)

    pref_text = ""
    if preference:
        pref_parts = []
        if preference.cooking_skill:
            skill_map = {"LOW": "초보", "MEDIUM": "중급", "HIGH": "고급"}
            skill_val = preference.cooking_skill.value if hasattr(preference.cooking_skill, 'value') else str(preference.cooking_skill)
            pref_parts.append(f"요리 실력: {skill_map.get(skill_val, skill_val)}")
        if preference.max_time:
            pref_parts.append(f"최대 조리 시간: {preference.max_time}분")
        if preference.allergies:
            pref_parts.append(f"알레르기/제외 재료: {', '.join(preference.allergies)}")
        if preference.cooking_tools:
            pref_parts.append(f"보유 조리도구: {', '.join(preference.cooking_tools)}")
        if preference.dietary_habits:
            pref_parts.append(f"식습관: {preference.dietary_habits}")
        if pref_parts:
            pref_text = "\n\n[사용자 선호 설정]\n" + "\n".join(pref_parts)

    return f"""당신은 전문 요리사입니다. 아래 냉장고 식재료로 만들 수 있는 레시피를 추천해주세요.

[냉장고 식재료]
{ingredients_text}
{pref_text}

[요구사항]
1. 유통기한이 임박한 재료를 우선적으로 활용하세요
2. 알레르기 재료는 절대 사용하지 마세요
3. 사용자의 요리 실력과 보유 도구에 맞는 레시피를 추천하세요
4. 최대 조리 시간을 초과하지 않는 레시피를 추천하세요

[응답 형식]
## 🍳 추천 레시피: (레시피 이름)

### 재료
- (사용할 재료 목록)

### 조리 순서
1. (단계별 조리 방법)

### 예상 조리 시간
- (소요 시간)

### 💡 팁
- (조리 팁이나 대체 재료 안내)
"""
