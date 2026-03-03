from datetime import date

from pydantic import BaseModel


class IngredientCreate(BaseModel):
    name: str
    quantity: int = 1
    unit: str = "개"
    expiry_date: date | None = None


class IngredientUpdate(BaseModel):
    name: str | None = None
    quantity: int | None = None
    unit: str | None = None
    expiry_date: date | None = None


class IngredientResponse(BaseModel):
    id: int
    storage_box_id: int
    name: str
    quantity: int
    unit: str
    expiry_date: date | None = None

    model_config = {"from_attributes": True}
