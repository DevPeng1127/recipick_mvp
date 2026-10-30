from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.dependencies.auth import get_current_user
from app.models.ingredient_log import ActionType
from app.models.user import User
from app.schemas.activity import ActivityDashboard
from app.services.activity_service import dashboard

router = APIRouter(prefix='/activity', tags=['activity'])


@router.get('', response_model=ActivityDashboard)
async def get_activity(
    response: Response,
    days: int = 30,
    refrigerator_id: Annotated[int | None, Query(gt=0)] = None,
    action_type: ActionType | None = None,
    cursor: Annotated[str | None, Query(max_length=4096)] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    response.headers['Cache-Control'] = 'no-store'
    if days not in (7, 30, 90):
        raise HTTPException(422, '조회 기간은 7일·30일·90일 중 선택해 주세요.')
    return await dashboard(user.id, db, days=days, refrigerator_id=refrigerator_id,
                           action_type=action_type, cursor=cursor)
