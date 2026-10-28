import asyncio
import logging
import math
import uuid
from collections.abc import Callable, Sequence
from contextlib import asynccontextmanager
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select, text, update

from app.database.connection import async_session
from app.models.recipe_usage import RecipeUsageAttempt

logger = logging.getLogger(__name__)
USER_RPM = 3
USER_RPD = 20
APP_RPM = 12
APP_RPD = 400
REQUEST_TIMEOUT_SECONDS = 60
LEASE_SECONDS = 90  # Longer than the absolute HTTP request deadline.
WINDOW = timedelta(seconds=60)


class RecipeRateLimitError(Exception):
    def __init__(
        self, code: str, message: str, *, now: datetime | None = None,
        retry_at: datetime | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.retry_at = retry_at
        self.retry_after_seconds = (
            max(1, math.ceil((retry_at - now).total_seconds()))
            if retry_at is not None and now is not None else None
        )

    def detail(self) -> dict:
        return {
            "code": self.code,
            "message": self.message,
            "retry_at": self.retry_at.isoformat() if self.retry_at else None,
            "retry_after_seconds": self.retry_after_seconds,
        }


def day_bounds(now: datetime, zone: str) -> tuple[datetime, datetime]:
    tz = ZoneInfo(zone)
    local_date = now.astimezone(tz).date()
    start = datetime.combine(local_date, time.min, tzinfo=tz)
    end = datetime.combine(local_date + timedelta(days=1), time.min, tzinfo=tz)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def check_limits(
    attempts: Sequence[RecipeUsageAttempt], user_id: int, now: datetime,
) -> None:
    user_start, user_reset = day_bounds(now, "Asia/Seoul")
    app_start, app_reset = day_bounds(now, "America/Los_Angeles")
    own = [attempt for attempt in attempts if attempt.user_id == user_id]
    violations: list[tuple[datetime, str, str]] = []

    for rows, limit, start, reset, code, message in (
        (own, USER_RPD, user_start, user_reset, "user_daily_limit", "오늘의 AI 사용 횟수를 모두 사용했습니다. 영수증·음성 인식과 레시피 추천은 한도를 공유합니다."),
        (attempts, APP_RPD, app_start, app_reset, "app_daily_limit", "앱 전체의 오늘 AI 사용 한도에 도달했습니다."),
    ):
        if sum(start <= row.started_at < reset for row in rows) >= limit:
            violations.append((reset, code, message))

    for rows, limit, code, message in (
        (own, USER_RPM, "user_minute_limit", "짧은 시간에 AI를 여러 번 요청했습니다. 잠시 후 다시 시도해 주세요."),
        (attempts, APP_RPM, "app_minute_limit", "현재 AI 요청이 많습니다. 잠시 후 다시 시도해 주세요."),
    ):
        starts = sorted(row.started_at for row in rows if row.started_at > now - WINDOW)
        if len(starts) >= limit:
            violations.append((starts[-limit] + WINDOW, code, message))

    if violations:
        retry_at, code, message = max(violations, key=lambda violation: violation[0])
        raise RecipeRateLimitError(code, message, now=now, retry_at=retry_at)

    if any(row.finished_at is None and row.lease_expires_at > now for row in own):
        # Completion may happen sooner than lease expiry; don't invent an exact wait.
        raise RecipeRateLimitError(
            "user_request_in_progress", "이미 AI 요청을 처리하고 있습니다. 완료 후 다시 요청해 주세요."
        )


class RecipeUsageLimiter:
    def __init__(self, session_factory=async_session, *, clock: Callable[[], datetime] | None = None):
        self.session_factory = session_factory
        self.clock = clock

    async def reserve(self, user_id: int) -> uuid.UUID:
        # Independent transaction: an API failure/rollback must not refund usage.
        async with self.session_factory() as session, session.begin():
            await session.execute(text("SET LOCAL lock_timeout = '5s'"))
            await session.execute(text("SET LOCAL statement_timeout = '5s'"))
            # Shared across processes; released at commit, before contacting Gemini.
            await session.execute(select(func.pg_advisory_xact_lock(721364, 8)))
            now = self.clock() if self.clock else (await session.execute(
                select(func.clock_timestamp())
            )).scalar_one()
            earliest = min(
                day_bounds(now, "Asia/Seoul")[0],
                day_bounds(now, "America/Los_Angeles")[0],
                now - WINDOW,
            )
            attempts = (await session.execute(select(RecipeUsageAttempt).where(
                RecipeUsageAttempt.started_at >= earliest
            ))).scalars().all()
            check_limits(attempts, user_id, now)
            # Two days covers both calendar days, including the 25-hour DST day.
            await session.execute(delete(RecipeUsageAttempt).where(
                RecipeUsageAttempt.started_at < now - timedelta(days=2)
            ))
            attempt_id = uuid.uuid4()
            session.add(RecipeUsageAttempt(
                id=attempt_id, user_id=user_id, started_at=now,
                lease_expires_at=now + timedelta(seconds=LEASE_SECONDS),
            ))
        return attempt_id

    async def finish(self, attempt_id: uuid.UUID) -> None:
        async with self.session_factory() as session, session.begin():
            await session.execute(update(RecipeUsageAttempt).where(
                RecipeUsageAttempt.id == attempt_id
            ).values(finished_at=func.clock_timestamp()))

    @asynccontextmanager
    async def attempt(self, user_id: int):
        attempt_id = await self.reserve(user_id)
        try:
            yield
        finally:
            try:
                await asyncio.wait_for(self.finish(attempt_id), timeout=5)
            except Exception as exc:
                # A crash/DB outage also recovers through the bounded lease.
                logger.warning("Recipe request lease cleanup failed (%s)", type(exc).__name__)


recipe_usage_limiter = RecipeUsageLimiter()
