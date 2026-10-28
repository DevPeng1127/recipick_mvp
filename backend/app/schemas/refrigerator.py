from datetime import datetime

from pydantic import BaseModel

from app.models.refrigerator import MemberRole
from app.schemas.common import ResourceName
from app.schemas.ingredient import IngredientBriefResponse


class RefrigeratorCreate(BaseModel):
    name: ResourceName


class RefrigeratorUpdate(BaseModel):
    name: ResourceName


class RefrigeratorMemberResponse(BaseModel):
    id: int
    user_id: int
    role: MemberRole
    nickname: str | None = None

    model_config = {"from_attributes": True}


class RefrigeratorResponse(BaseModel):
    role: MemberRole = MemberRole.OWNER
    id: int
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class RefrigeratorListResponse(BaseModel):
    id: int
    name: str
    created_at: datetime
    role: MemberRole
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
    role: MemberRole
    members: list[RefrigeratorMemberResponse] = []
    storage_boxes: list["StorageBoxResponse"] = []

    model_config = {"from_attributes": True}


from app.schemas.storage import StorageBoxResponse  # noqa: E402

RefrigeratorDetailResponse.model_rebuild()
