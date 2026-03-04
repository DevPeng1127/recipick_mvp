from datetime import date

from pydantic import BaseModel


class IngredientCreate(BaseModel):
    name: str
    quantity: float = 1
    unit: str = "개"
    expiry_date: date | None = None


class IngredientUpdate(BaseModel):
    name: str | None = None
    quantity: float | None = None
    unit: str | None = None
    expiry_date: date | None = None


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
