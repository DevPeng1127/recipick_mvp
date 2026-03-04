from pydantic import BaseModel


class RecipeRecommendRequest(BaseModel):
    refrigerator_ids: list[int]


class RecipeResponse(BaseModel):
    recipe: str
