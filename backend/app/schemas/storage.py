from pydantic import BaseModel

from app.models.storage import StorageType


class StorageBoxCreate(BaseModel):
    name: str
    type: StorageType


class StorageBoxUpdate(BaseModel):
    name: str | None = None
    type: StorageType | None = None


class StorageBoxResponse(BaseModel):
    id: int
    refrigerator_id: int
    name: str
    type: StorageType

    model_config = {"from_attributes": True}
