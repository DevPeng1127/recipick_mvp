import re

from pydantic import BaseModel, field_validator

from app.models.user import CookingSkill


class UserUpdate(BaseModel):
    nickname: str

    @field_validator("nickname")
    @classmethod
    def validate_nickname(cls, v: str) -> str:
        if not re.match(r'^[가-힣a-zA-Z0-9\-_()]+$', v):
            raise ValueError('닉네임은 한글, 영문, 숫자, -, _, () 만 가능합니다')
        if len(v) < 1 or len(v) > 20:
            raise ValueError('닉네임은 1~20자 사이여야 합니다')
        return v


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
