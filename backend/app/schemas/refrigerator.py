from datetime import datetime

from pydantic import BaseModel

from app.models.refrigerator import MemberRole
from app.schemas.ingredient import IngredientBriefResponse


class RefrigeratorCreate(BaseModel):
    name: str


class RefrigeratorUpdate(BaseModel):
    name: str


class RefrigeratorMemberResponse(BaseModel):
    id: int
    user_id: int
    role: MemberRole
    nickname: str | None = None

    model_config = {"from_attributes": True}


class RefrigeratorResponse(BaseModel):
    id: int
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class RefrigeratorListResponse(BaseModel):
    id: int
    name: str
    created_at: datetime
    is_favorite: bool = False
    top_ingredients: list[IngredientBriefResponse] = []
    total_ingredient_count: int = 0

    model_config = {"from_attributes": True}


class ReorderRequest(BaseModel):
    ordered_ids: list[int]


class RefrigeratorDetailResponse(BaseModel):
    id: int
    name: str
    created_at: datetime
    members: list[RefrigeratorMemberResponse] = []
    storage_boxes: list["StorageBoxResponse"] = []

    model_config = {"from_attributes": True}


from app.schemas.storage import StorageBoxResponse  # noqa: E402

RefrigeratorDetailResponse.model_rebuild()
