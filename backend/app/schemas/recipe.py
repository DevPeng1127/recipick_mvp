from datetime import date, datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ResourceName

Quantity = Annotated[float, Field(gt=0, le=1_000_000, allow_inf_nan=False, strict=True)]


class RecipeRecommendRequest(BaseModel):
    refrigerator_ids: list[int]
    servings: int = Field(default=1, ge=1, le=8, strict=True)


class RecipeResponse(BaseModel):
    recipe: str
    plan_id: UUID | None = None


class RecipeNeed(BaseModel):
    ingredient_name: ResourceName
    quantity: Quantity | None
    unit: str | None = Field(max_length=20)


class GeneratedRecipe(BaseModel):
    title: ResourceName
    recipe: str = Field(min_length=1, max_length=12000)
    requirements: list[RecipeNeed] = Field(min_length=1, max_length=30)


class CookingStock(BaseModel):
    ingredient_id: int
    name: str
    quantity: float
    unit: str
    expiry_date: date | None
    refrigerator_id: int
    refrigerator_name: str
    storage_box_name: str
    token: str


class CookingSuggestion(BaseModel):
    requirement_index: int
    ingredient_id: int | None
    quantity: float | None
    message: str | None = None


class CookingPreview(BaseModel):
    plan_id: UUID
    title: str
    recipe: str
    servings: int
    requirements: list[RecipeNeed]
    stock: list[CookingStock]
    suggestions: list[CookingSuggestion]
    applied_at: datetime | None
    result: dict | None


class CookingItem(BaseModel):
    ingredient_id: int = Field(gt=0, strict=True)
    quantity: Quantity
    expected_token: str = Field(pattern=r"^[a-f0-9]{64}$")

    @field_validator("quantity")
    @classmethod
    def four_decimal_places(cls, value):
        number = Decimal(str(value))
        if number != number.quantize(Decimal("0.0001")):
            raise ValueError("수량은 소수점 4자리까지 입력할 수 있습니다.")
        return value


class CookingCommit(BaseModel):
    items: list[CookingItem] = Field(min_length=1, max_length=60)

    @field_validator("items")
    @classmethod
    def unique_ingredients(cls, items):
        if len({item.ingredient_id for item in items}) != len(items):
            raise ValueError("같은 재료의 차감량을 합산해 주세요.")
        return items
