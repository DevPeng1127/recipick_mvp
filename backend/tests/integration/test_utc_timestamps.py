"""Round-trip new defaults and existing naive UTC values through PostgreSQL."""
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.ingredient_log import ActionType, IngredientLog
from app.models.refrigerator import Refrigerator
from app.models.user import User


async def test_timestamp_defaults_and_legacy_values_keep_database_format(setup_db, test_engine):
    sessions = async_sessionmaker(test_engine, expire_on_commit=False)
    legacy_at = datetime(2020, 2, 29, 14, 59, 59, 123456)
    before = datetime.now(timezone.utc).replace(tzinfo=None)
    async with sessions.begin() as db:
        # A non-UTC DB session must still store the application's UTC wall time.
        await db.execute(text("SET LOCAL TIME ZONE 'Asia/Seoul'"))
        db.add_all([
            User(id=1, oauth_provider="kakao", oauth_id="utc-new", nickname="새 회원"),
            User(id=2, oauth_provider="kakao", oauth_id="utc-old", nickname="기존 회원", created_at=legacy_at),
            Refrigerator(id=1, name="새 냉장고"),
            Refrigerator(id=2, name="기존 냉장고", created_at=legacy_at),
        ])
        await db.flush()
        db.add_all([
            IngredientLog(id=1, user_id=1, refrigerator_id=1, refrigerator_name="새 냉장고",
                          ingredient_id=1, ingredient_name="당근", action_type=ActionType.CONSUMED,
                          quantity=1, unit="개"),
            IngredientLog(id=2, user_id=2, refrigerator_id=2, refrigerator_name="기존 냉장고",
                          ingredient_id=2, ingredient_name="양파", action_type=ActionType.DISPOSED,
                          quantity=1, unit="개", created_at=legacy_at),
        ])
    after = datetime.now(timezone.utc).replace(tzinfo=None)

    async with sessions() as db:
        await db.execute(text("SET LOCAL TIME ZONE 'America/Los_Angeles'"))
        columns = (await db.execute(text("""
            SELECT table_name, data_type FROM information_schema.columns
            WHERE table_schema = current_schema() AND column_name = 'created_at'
                AND table_name IN ('users', 'refrigerators', 'ingredient_logs')
        """))).all()
        assert dict(columns) == {
            table: "timestamp without time zone"
            for table in ("users", "refrigerators", "ingredient_logs")
        }
        for model in (User, Refrigerator, IngredientLog):
            new_at, old_at = (await db.scalars(select(model.created_at).order_by(model.id))).all()
            assert new_at.tzinfo is None and before <= new_at <= after
            assert old_at.tzinfo is None and old_at == legacy_at
