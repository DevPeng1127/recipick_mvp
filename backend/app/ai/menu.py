"""Compile one linked menu into the existing display/consumption-plan contract.

References enforce structural consistency, not culinary correctness or food safety.
Free-text instructions still require user review.
"""
import re
import unicodedata
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.schemas.recipe import GeneratedRecipe, RecipeNeed

Reference = Annotated[int, Field(ge=0, le=29, strict=True)]
REFERENCE = re.compile(r"\{(0|[1-9]\d?)\}")
# Quantities belong to requirements only. Durations, temperatures and dimensions
# remain valid in instructions (e.g. 3분, 180도, 1cm).
INLINE_AMOUNT = re.compile(
    r"(?:\d+(?:[.,/]\d+)?|반|한|두|세|네)\s*"
    r"(?:kg|mg|ml|g|l|킬로그램|그램|밀리리터|리터|개|팩|봉지|큰술|작은술|스푼|컵|공기|꼬집|줌)",
    re.IGNORECASE,
)
# Catch common unlisted pantry additions too, even when the inventory does not
# contain them. This is deliberately a bounded language check, not a food NLP
# classifier. Word starts avoid mistaking cooking terms such as 파기름 for a
# separate ingredient mention after all actual ingredients were referenced.
PANTRY_NAMES = (
    "올리브오일", "올리브유", "해바라기유", "카놀라유", "식용유", "참기름", "들기름", "기름",
    "다진 마늘", "다진마늘", "고추장", "된장", "굴소스", "마요네즈", "케첩",
    "소금", "후추", "간장", "설탕", "식초", "버터", "마늘", "물", "달걀", "계란",
)
PANTRY_MENTION = re.compile(
    r"(?<![가-힣A-Za-z])(" + "|".join(map(re.escape, PANTRY_NAMES)) +
    r")(?=$|[\s,.!?·/()]|으로|을|를|은|는|이|가|과|와|에|로|도|만)"
)
# App default approved by the user, not an official dietary recommendation.
BEVERAGE_ML_PER_SERVING = 250
BEVERAGE_NAME = re.compile(r"(?:주스|쥬스|과채음료|탄산음료|콜라|사이다|이온음료|스포츠음료)$")
SPECIAL_BEVERAGE = re.compile(r"농축|원액|베이스|시럽|분말|칵테일|알코올|알콜|주류|와인|맥주|소주|영아|유아|분유|의료|단백질|보충|에너지|홍삼")
BEVERAGE_PREPARATION = re.compile(r"희석|혼합|섞|믹스|칵테일|소스|적시|재우|끓|볶|졸|가열|갈아")


class MenuConsistencyError(ValueError):
    """Safe error code only: never include the model response or preferences."""


class MenuNeed(RecipeNeed):
    model_config = ConfigDict(extra="forbid")


class MenuDish(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # No independently generated title: these are the actual title ingredients.
    main_ingredients: list[Reference] = Field(min_length=1, max_length=3)
    method: Literal[
        "볶음", "구이", "찜", "삶기", "끓이기", "조림", "무침", "비빔",
        "부치기", "튀기기", "데우기", "곁들이기", "담아내기",
    ]
    steps: list[Annotated[str, Field(min_length=1, max_length=600)]] = Field(min_length=1, max_length=8)


class MenuDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requirements: list[MenuNeed] = Field(max_length=30)
    dishes: list[MenuDish] = Field(max_length=4)
    notes: str = Field(max_length=1500)


def normalized_name(name: str) -> str:
    return "".join(unicodedata.normalize("NFKC", name).casefold().split())


def _step_references(step: str, count: int) -> set[int]:
    refs = {int(match) for match in REFERENCE.findall(step)}
    if any(ref >= count for ref in refs):
        raise MenuConsistencyError("unknown_ingredient_reference")
    literal = REFERENCE.sub("", step)
    if "{" in literal or "}" in literal:
        raise MenuConsistencyError("malformed_ingredient_reference")
    if INLINE_AMOUNT.search(literal):
        raise MenuConsistencyError("independent_instruction_quantity")
    return refs


def _amount(need: RecipeNeed) -> str:
    if need.quantity is None or need.unit is None:
        return "사용량 확인 필요"
    number = format(Decimal(str(need.quantity)).normalize(), "f")
    return f"{number}{need.unit}"


def _cap_beverage_portions(draft: MenuDraft, servings: int) -> list[str]:
    """Lower oversized ready-to-drink sides only, after reference validation.

    A requirement shared with a cooked/mixed dish is left alone: its drinking
    share cannot be inferred from the combined quantity. Unknown names/units
    are intentionally not guessed. Never increase a smaller proposal.
    """
    notices = []
    cap_ml = BEVERAGE_ML_PER_SERVING * servings
    for index, need in enumerate(draft.requirements):
        name = normalized_name(need.ingredient_name)
        if not BEVERAGE_NAME.search(name) or SPECIAL_BEVERAGE.search(name):
            continue
        if need.quantity is None or need.unit is None:
            continue
        unit = unicodedata.normalize("NFKC", need.unit).strip().casefold()
        factor = {"ml": Decimal(1), "l": Decimal(1000)}.get(unit)
        if factor is None or Decimal(str(need.quantity)) * factor <= cap_ml:
            continue
        used_in = [dish for dish in draft.dishes if any(
            str(index) in REFERENCE.findall(step) for step in dish.steps
        )]
        if not used_in or any(
            dish.main_ingredients != [index] or dish.method not in {"곁들이기", "담아내기"}
            or any(BEVERAGE_PREPARATION.search(REFERENCE.sub("", step)) for step in dish.steps)
            for dish in used_in
        ):
            continue
        need.quantity = float(Decimal(cap_ml) / factor)
        need.unit = "L" if unit == "l" else "ml"
        notices.append(
            f"{need.ingredient_name}: 곁들임 음료의 앱 기준(1인분 {BEVERAGE_ML_PER_SERVING}mL)을 적용해 "
            f"총 {cap_ml}mL로 보정했습니다. 실제 마신 양은 차감 전에 수정할 수 있습니다."
        )
    return notices


def compile_menu(raw: str, *, servings: int, inventory_names: list[str]) -> GeneratedRecipe:
    try:
        draft = MenuDraft.model_validate_json(raw)
    except ValidationError:
        raise MenuConsistencyError("invalid_menu_structure") from None

    needs = draft.requirements
    if "{" in draft.notes or "}" in draft.notes or INLINE_AMOUNT.search(draft.notes):
        raise MenuConsistencyError("independent_notes_reference_or_quantity")
    names = [normalized_name(item.ingredient_name) for item in needs]
    if len(set(names)) != len(names):
        raise MenuConsistencyError("duplicate_ingredient")
    if bool(needs) != bool(draft.dishes):
        raise MenuConsistencyError("missing_dishes_or_requirements")
    if not needs:
        if not draft.notes.strip():
            raise MenuConsistencyError("missing_no_menu_explanation")
        return GeneratedRecipe(title="재료 확인 필요", recipe=draft.notes.strip(), requirements=[])

    known_names = {normalized_name(name): name for name in inventory_names}
    # Keep the user's exact stock names even when the model only changed spacing
    # or letter case. No fuzzy matching of different foods/products.
    for need, name in zip(needs, names):
        if need.ingredient_name in inventory_names:
            continue
        candidates = {item for item in inventory_names if normalized_name(item) == name}
        if len(candidates) > 1:
            raise MenuConsistencyError("ambiguous_stock_name")
        if candidates:
            need.ingredient_name = candidates.pop()

    for mention in PANTRY_MENTION.findall(draft.notes):
        mentioned = normalized_name(mention)
        # Existing stock can be named in notes to explain why it was excluded.
        if not any(mentioned in name for name in set(names) | set(known_names)):
            raise MenuConsistencyError("unlisted_notes_ingredient")

    titles, instructions, all_used = [], [], set()
    for dish in draft.dishes:
        mains = dish.main_ingredients
        if len(mains) != len(set(mains)) or any(index >= len(needs) for index in mains):
            raise MenuConsistencyError("invalid_title_ingredient")
        used = set()
        for step in dish.steps:
            if not step.strip():
                raise MenuConsistencyError("empty_instruction")
            used.update(_step_references(step, len(needs)))
            literal_text = REFERENCE.sub("", step)
            if PANTRY_MENTION.search(literal_text):
                raise MenuConsistencyError("unlinked_pantry_ingredient")
            literal = normalized_name(literal_text)
            # Stock/declared ingredient names must also use references, rather
            # than accidentally introducing an unlinked mention in prose.
            if any(name and name in literal for name in set(names) | set(known_names)):
                raise MenuConsistencyError("unlinked_ingredient_name")
        if not set(mains).issubset(used):
            raise MenuConsistencyError("title_ingredient_not_used")
        all_used.update(used)
        title = "·".join(needs[index].ingredient_name for index in mains) + " " + dish.method
        titles.append(title)
        instructions.append("\n".join([title] + [
            f"{index}. " + REFERENCE.sub(lambda match: needs[int(match[1])].ingredient_name, step.strip())
            for index, step in enumerate(dish.steps, 1)
        ]))
    if all_used != set(range(len(needs))):
        raise MenuConsistencyError("unused_deduction_ingredient")

    portion_notices = _cap_beverage_portions(draft, servings)

    title = " + ".join(titles)
    # Persisted titles use VARCHAR(100). Keep the full names in the body; shorten
    # only the display title for unusually long product names/multiple dishes.
    if len(title) > 100:
        title = title[:99] + "…"
    ingredient_lines = []
    for need, name in zip(needs, names):
        availability = "" if name in known_names else " · 재고에 없음, 별도 준비 확인"
        ingredient_lines.append(f"- {need.ingredient_name}: {_amount(need)}{availability}")
    sections = [f"사용 재료 · {servings}인분 전체 사용량\n" + "\n".join(ingredient_lines), *instructions]
    if portion_notices:
        sections.append("사용량 보정 안내\n" + "\n".join(portion_notices))
    if draft.notes.strip():
        sections.append("안내\n" + draft.notes.strip())
    try:
        return GeneratedRecipe(title=title, recipe="\n\n".join(sections), requirements=needs)
    except ValidationError:
        raise MenuConsistencyError("compiled_menu_too_large") from None
