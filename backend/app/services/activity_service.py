from datetime import datetime, time, timedelta, timezone

from fastapi import HTTPException
from jose import jwt
from pydantic import ValidationError
from sqlalchemy import Date, and_, cast, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.ingredient_log import ActionType, IngredientLog
from app.models.refrigerator import Refrigerator, RefrigeratorMember
from app.models.user import User
from app.schemas.activity import (
    ActivityCounts, ActivityDashboard, ActivityDay, ActivityItem, ActivityPosition,
    ActivityRefrigerator, FrequentDisposal,
)
from app.utils.security import decode_token

KST = timezone(timedelta(hours=9))
PAGE_SIZE = 20


def utc_now():
    return datetime.now(timezone.utc)


def period(as_of: datetime, days: int):
    end_date = as_of.astimezone(KST).date()
    start_date = end_date - timedelta(days=days - 1)
    # Existing log timestamps are UTC stored in a timestamp-without-timezone column.
    start_utc = datetime.combine(start_date, time.min, KST).astimezone(timezone.utc).replace(tzinfo=None)
    return start_date, end_date, start_utc


def read_cursor(cursor: str, user_id: int, filters: dict):
    payload = decode_token(cursor)
    try:
        if (not payload or payload.get('type') != 'activity_cursor'
                or payload.get('sub') != str(user_id) or payload.get('filters') != filters):
            raise ValueError
        position = ActivityPosition.model_validate(payload['position'])
        if position.before_at > position.as_of or position.before_id > position.max_id:
            raise ValueError
        return position, payload['exp']
    except (KeyError, ValueError, ValidationError):
        raise HTTPException(400, '목록 조회 정보가 만료되었거나 올바르지 않습니다. 새로고침해 주세요.') from None


def write_cursor(position: ActivityPosition, user_id: int, filters: dict, expires_at):
    return jwt.encode({
        'type': 'activity_cursor', 'sub': str(user_id), 'exp': expires_at,
        'filters': filters, 'position': position.model_dump(mode='json'),
    }, settings.JWT_SECRET_KEY.get_secret_value(), algorithm=settings.JWT_ALGORITHM)


async def dashboard(user_id: int, db: AsyncSession, *, days: int = 30,
                    refrigerator_id: int | None = None, action_type: ActionType | None = None,
                    cursor: str | None = None):
    filters = {'days': days, 'refrigerator_id': refrigerator_id,
               'action_type': action_type.value if action_type else None}
    position, expires_at = read_cursor(cursor, user_id, filters) if cursor else (None, datetime.now(timezone.utc) + timedelta(hours=1))

    # Authentication has already opened a transaction. Start a fresh, read-only
    # snapshot so counts, day groups, ranking and this page agree under writes.
    await db.commit()
    await db.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'))
    fridges = (await db.execute(select(Refrigerator.id, Refrigerator.name)
        .join(RefrigeratorMember).where(RefrigeratorMember.user_id == user_id)
        .order_by(Refrigerator.id))).all()
    names = dict(fridges)
    if refrigerator_id is not None and refrigerator_id not in names:
        raise HTTPException(403, '이 냉장고의 가족 기록을 볼 권한이 없습니다. 내 기록으로 돌아가 주세요.')

    as_of = position.as_of if position else utc_now()
    start_date, end_date, start_utc = period(as_of, days)
    clauses = [IngredientLog.created_at >= start_utc,
               IngredientLog.created_at <= as_of.astimezone(timezone.utc).replace(tzinfo=None)]
    if refrigerator_id is None:
        # Personal history survives leaving a fridge or deletion of the fridge.
        clauses.append(IngredientLog.user_id == user_id)
    else:
        # Membership is checked on EVERY page, including signed cursor requests.
        clauses.append(IngredientLog.refrigerator_id == refrigerator_id)
    if action_type:
        clauses.append(IngredientLog.action_type == action_type)

    max_id = position.max_id if position else (await db.scalar(
        select(func.max(IngredientLog.id)).where(*clauses)) or 0)
    clauses.append(IngredientLog.id <= max_id)
    consumed = func.count().filter(IngredientLog.action_type == ActionType.CONSUMED)
    disposed = func.count().filter(IngredientLog.action_type == ActionType.DISPOSED)
    counts = (await db.execute(select(consumed, disposed).where(*clauses))).one()

    day = cast(IngredientLog.created_at + timedelta(hours=9), Date)
    day_rows = (await db.execute(select(day, consumed, disposed).where(*clauses).group_by(day))).all()
    by_day = {row[0]: row[1:] for row in day_rows}
    daily = []
    for offset in range(days):
        current = start_date + timedelta(days=offset)
        values = by_day.get(current, (0, 0))
        daily.append(ActivityDay(date=current, consumed=values[0], disposed=values[1]))

    # Name frequency only: grams, packs and pieces are never summed together.
    name = func.trim(IngredientLog.ingredient_name)
    ranking = (await db.execute(select(name, func.count().label('count')).where(
        *clauses, IngredientLog.action_type == ActionType.DISPOSED)
        .group_by(name).order_by(func.count().desc(), name.asc()).limit(5))).all()

    page_clauses = list(clauses)
    if position:
        before = position.before_at.astimezone(timezone.utc).replace(tzinfo=None)
        page_clauses.append(or_(IngredientLog.created_at < before,
            and_(IngredientLog.created_at == before, IngredientLog.id < position.before_id)))
    rows = (await db.execute(select(IngredientLog, User.nickname)
        .join(User, User.id == IngredientLog.user_id).where(*page_clauses)
        .order_by(IngredientLog.created_at.desc(), IngredientLog.id.desc()).limit(PAGE_SIZE + 1))).all()
    items = [ActivityItem(
        id=log.id, action_type=log.action_type, ingredient_name=log.ingredient_name,
        quantity=log.quantity, unit=log.unit, refrigerator_id=log.refrigerator_id,
        refrigerator_name=log.refrigerator_name, actor_name=nickname or '이름 없는 회원',
        is_mine=log.user_id == user_id, expiry_date=log.expiry_date, expiry_source=log.expiry_source, memo=log.memo,
        created_at=log.created_at.replace(tzinfo=timezone.utc),
    ) for log, nickname in rows[:PAGE_SIZE]]
    next_cursor = None
    if len(rows) > PAGE_SIZE:
        last = items[-1]
        next_cursor = write_cursor(ActivityPosition(as_of=as_of, max_id=max_id,
            before_at=last.created_at, before_id=last.id), user_id, filters, expires_at)
    return ActivityDashboard(
        scope='mine' if refrigerator_id is None else 'refrigerator',
        refrigerator_name=names.get(refrigerator_id),
        refrigerators=[ActivityRefrigerator(id=id, name=name) for id, name in fridges],
        start_date=start_date, end_date=end_date, as_of=as_of,
        counts=ActivityCounts(consumed=counts[0], disposed=counts[1], total=sum(counts)),
        daily=daily, frequent_disposals=[FrequentDisposal(name=name, count=count) for name, count in ranking],
        items=items, next_cursor=next_cursor,
    )
