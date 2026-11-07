"""Bounded PostgreSQL lock observation for isolated integration tests."""
import asyncio

from sqlalchemy import select, text

from app.models.cooking_plan import CookingPlan
from app.models.ingredient import Ingredient
from app.models.ingredient_log import IngredientLog


async def bounded_settings(db):
    await db.execute(text("SET LOCAL statement_timeout = '12s'"))
    await db.execute(text("SET LOCAL lock_timeout = '10s'"))
    # Keep the server's deadlock_timeout so a cycle surfaces before our bounds.


async def lock_snapshot(observer, pids):
    await observer.execute(text("SELECT pg_stat_clear_snapshot()"))
    activities = (await observer.execute(text("""
        SELECT pid, state, wait_event_type, wait_event,
               pg_blocking_pids(pid) AS blockers
        FROM pg_stat_activity WHERE pid = ANY(:pids) ORDER BY pid
    """), {"pids": pids})).mappings().all()
    locks = (await observer.execute(text("""
        SELECT pid, locktype, mode, granted, relation::regclass::text AS relation,
               page, tuple, transactionid::text AS transactionid
        FROM pg_locks WHERE pid = ANY(:pids)
        ORDER BY pid, locktype, relation, mode
    """), {"pids": pids})).mappings().all()
    return {"activity": [dict(row) for row in activities],
            "locks": [dict(row) for row in locks]}


async def wait_edges(observer, pids, edges):
    # Advance only after observing the requested waits, rather than assuming
    # that a request reached its lock after sleeping for a fixed duration.
    async with asyncio.timeout(8):
        while True:
            state = await lock_snapshot(observer, pids)
            blockers = {row["pid"]: row["blockers"] for row in state["activity"]}
            if all(blocker in blockers.get(waiter, []) for waiter, blocker in edges):
                return state
            await asyncio.sleep(0.01)


async def inventory_state(sessions):
    async with sessions() as db:
        return {
            "stock": [dict(row) for row in (await db.execute(select(
                Ingredient.id, Ingredient.quantity, Ingredient.storage_box_id,
            ).order_by(Ingredient.id))).mappings()],
            "logs": [dict(row) for row in (await db.execute(select(
                IngredientLog.user_id, IngredientLog.ingredient_id, IngredientLog.quantity,
            ).order_by(IngredientLog.id))).mappings()],
            "plans": [dict(row) for row in (await db.execute(select(
                CookingPlan.user_id, CookingPlan.applied_at,
                CookingPlan.request_hash, CookingPlan.result,
            ).order_by(CookingPlan.user_id))).mappings()],
        }
