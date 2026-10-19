from datetime import date
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator
from pydantic.json_schema import SkipJsonSchema

from app.schemas.common import ResourceName


IngredientUnit = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)
]
PositiveQuantity = Annotated[float, Field(gt=0, allow_inf_nan=False, strict=True)]


class IngredientCreate(BaseModel):
    name: ResourceName
    quantity: PositiveQuantity = 1
    unit: IngredientUnit = "개"
    expiry_date: date | None = None


class IngredientUpdate(BaseModel):
    name: ResourceName | SkipJsonSchema[None] = None
    quantity: PositiveQuantity | SkipJsonSchema[None] = None
    unit: IngredientUnit | SkipJsonSchema[None] = None
    expiry_date: date | None = None

    @field_validator("name", "quantity", "unit")
    @classmethod
    def reject_explicit_null(cls, value):
        # Omitted fields keep their default and are excluded by exclude_unset.
        # Only expiry_date may explicitly clear an existing value.
        if value is None:
            raise ValueError("Field cannot be null; omit it to keep the current value")
        return value


class IngredientBriefResponse(BaseModel):
    name: str
    expiry_date: date | None = None

    model_config = {"from_attributes": True}


class IngredientResponse(BaseModel):
    id: int
    storage_box_id: int
    name: str
    quantity: float
    unit: str
    expiry_date: date | None = None

    model_config = {"from_attributes": True}


class ConsumeDisposeRequest(BaseModel):
    quantity: PositiveQuantity | None = None  # null = 전량
    memo: str | None = None


class IngredientSearchResult(BaseModel):
    ingredient_id: int
    ingredient_name: str
    quantity: float
    unit: str
    expiry_date: date | None = None
    storage_box_name: str
    storage_box_type: str
    refrigerator_name: str
    refrigerator_id: int
