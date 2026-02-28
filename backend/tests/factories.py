from datetime import date, timedelta

from app.models.ingredient import Ingredient
from app.models.refrigerator import MemberRole, Refrigerator, RefrigeratorMember
from app.models.storage import StorageBox, StorageType
from app.models.user import CookingSkill, User, UserPreference


def make_user(
    oauth_provider: str = "kakao",
    oauth_id: str = "test_123",
    nickname: str = "테스트유저",
) -> User:
    return User(
        oauth_provider=oauth_provider,
        oauth_id=oauth_id,
        nickname=nickname,
    )


def make_refrigerator(name: str = "우리집 냉장고") -> Refrigerator:
    return Refrigerator(name=name)


def make_member(
    refrigerator_id: int = 1,
    user_id: int = 1,
    role: MemberRole = MemberRole.OWNER,
) -> RefrigeratorMember:
    return RefrigeratorMember(
        refrigerator_id=refrigerator_id,
        user_id=user_id,
        role=role,
    )


def make_storage_box(
    refrigerator_id: int = 1,
    name: str = "야채칸",
    type: StorageType = StorageType.FRIDGE,
) -> StorageBox:
    return StorageBox(
        refrigerator_id=refrigerator_id,
        name=name,
        type=type,
    )


def make_ingredient(
    storage_box_id: int = 1,
    name: str = "두부",
    quantity: int = 1,
    expiry_date: date | None = None,
) -> Ingredient:
    if expiry_date is None:
        expiry_date = date.today() + timedelta(days=7)
    return Ingredient(
        storage_box_id=storage_box_id,
        name=name,
        quantity=quantity,
        expiry_date=expiry_date,
    )


def make_user_preference(
    user_id: int = 1,
    cooking_skill: CookingSkill = CookingSkill.MEDIUM,
    max_time: int = 30,
    allergies: list[str] | None = None,
    cooking_tools: list[str] | None = None,
    dietary_habits: str | None = None,
) -> UserPreference:
    return UserPreference(
        user_id=user_id,
        cooking_skill=cooking_skill,
        max_time=max_time,
        allergies=allergies or [],
        cooking_tools=cooking_tools or ["프라이팬", "냄비"],
        dietary_habits=dietary_habits,
    )
