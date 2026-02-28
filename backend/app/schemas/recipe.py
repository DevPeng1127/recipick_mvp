from pydantic import BaseModel


class RecipeRecommendRequest(BaseModel):
    refrigerator_id: int


class RecipeResponse(BaseModel):
    recipe: str
