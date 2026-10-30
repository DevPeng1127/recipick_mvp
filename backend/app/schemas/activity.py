from app.schemas.ingredient import ExpirySource
from datetime import date, datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field

from app.models.ingredient_log import ActionType


class ActivityRefrigerator(BaseModel):
    id: int
    name: str


class ActivityCounts(BaseModel):
    consumed: int
    disposed: int
    total: int


class ActivityDay(BaseModel):
    date: date
    consumed: int
    disposed: int


class FrequentDisposal(BaseModel):
    name: str
    count: int


class ActivityItem(BaseModel):
    id: int
    action_type: ActionType
    ingredient_name: str
    quantity: float
    unit: str
    refrigerator_id: int | None
    refrigerator_name: str
    actor_name: str
    is_mine: bool
    expiry_date: date | None
    expiry_source: ExpirySource = "unknown"
    memo: str | None
    created_at: datetime


class ActivityDashboard(BaseModel):
    scope: Literal['mine', 'refrigerator']
    refrigerator_name: str | None
    refrigerators: list[ActivityRefrigerator]
    start_date: date
    end_date: date
    as_of: datetime
    counts: ActivityCounts
    daily: list[ActivityDay]
    frequent_disposals: list[FrequentDisposal]
    items: list[ActivityItem]
    next_cursor: str | None


class ActivityPosition(BaseModel):
    as_of: AwareDatetime
    max_id: int = Field(ge=0)
    before_at: AwareDatetime
    before_id: int = Field(gt=0)
