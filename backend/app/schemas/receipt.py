from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.common import ResourceName
from app.schemas.ingredient import IngredientCreate, IngredientUnit, PositiveQuantity


class ReceiptItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    source_text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    name: ResourceName
    quantity: PositiveQuantity | None
    unit: IngredientUnit | None
    needs_review: bool


class ReceiptPreview(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    items: list[ReceiptItem] = Field(max_length=20)
    has_more: bool


class IngredientBatchCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[IngredientCreate] = Field(min_length=1, max_length=20)


class DistributedIngredientCreate(IngredientCreate):
    model_config = ConfigDict(extra="forbid")

    storage_box_id: int = Field(gt=0, strict=True)


class RefrigeratorIngredientBatchCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[DistributedIngredientCreate] = Field(min_length=1, max_length=20)
