from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.ingredients import router as ingredients_router
from app.api.v1.recipes import router as recipes_router
from app.api.v1.refrigerators import router as refrigerators_router
from app.api.v1.storage_boxes import router as storage_boxes_router
from app.api.v1.users import router as users_router

api_router = APIRouter()

api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(refrigerators_router)
api_router.include_router(storage_boxes_router)
api_router.include_router(ingredients_router)
api_router.include_router(recipes_router)
