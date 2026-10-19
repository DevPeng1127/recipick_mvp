from pydantic import BaseModel, field_validator
from pydantic.json_schema import SkipJsonSchema

from app.models.storage import StorageType
from app.schemas.common import ResourceName


class StorageBoxCreate(BaseModel):
    name: ResourceName
    type: StorageType


class StorageBoxUpdate(BaseModel):
    name: ResourceName | SkipJsonSchema[None] = None
    type: StorageType | SkipJsonSchema[None] = None

    @field_validator("name", "type")
    @classmethod
    def reject_explicit_null(cls, value):
        # A partial update may omit a field but cannot clear a NOT NULL column.
        if value is None:
            raise ValueError("Field cannot be null; omit it to keep the current value")
        return value


class StorageBoxResponse(BaseModel):
    id: int
    refrigerator_id: int
    name: str
    type: StorageType

    model_config = {"from_attributes": True}
