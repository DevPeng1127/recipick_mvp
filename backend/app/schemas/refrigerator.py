from datetime import datetime

from pydantic import BaseModel

from app.models.refrigerator import MemberRole


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


class RefrigeratorDetailResponse(BaseModel):
    id: int
    name: str
    created_at: datetime
    members: list[RefrigeratorMemberResponse] = []
    storage_boxes: list["StorageBoxResponse"] = []

    model_config = {"from_attributes": True}


from app.schemas.storage import StorageBoxResponse  # noqa: E402

RefrigeratorDetailResponse.model_rebuild()
