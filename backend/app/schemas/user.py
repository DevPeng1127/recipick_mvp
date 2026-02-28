from pydantic import BaseModel

from app.models.user import CookingSkill


class UserResponse(BaseModel):
    id: int
    oauth_provider: str
    nickname: str

    model_config = {"from_attributes": True}


class UserPreferenceResponse(BaseModel):
    id: int
    user_id: int
    cooking_skill: CookingSkill | None = None
    max_time: int | None = None
    allergies: list[str] | None = None
    cooking_tools: list[str] | None = None
    dietary_habits: str | None = None

    model_config = {"from_attributes": True}


class UserPreferenceUpdate(BaseModel):
    cooking_skill: CookingSkill | None = None
    max_time: int | None = None
    allergies: list[str] | None = None
    cooking_tools: list[str] | None = None
    dietary_habits: str | None = None
