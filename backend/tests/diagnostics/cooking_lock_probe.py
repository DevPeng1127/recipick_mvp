"""Historical reproduction for product code at 2777bbf (before the lock fix).

Run this file explicitly with pytest and the guarded local TEST_DATABASE_URL.
It expects the original defect (40P01). Product SQL and transaction handling run
unchanged through the HTTP endpoint. See docs/cooking-lock-analysis.md.
For the fixed implementation run integration/test_cooking_locks.py instead.
"""
import asyncio
import contextvars
import json
import os
from pathlib import Path

import pytest
from sqlalchemy import event, select, text

from app.models.cooking_plan import CookingPlan
from app.models.ingredient import Ingredient
from app.models.ingredient_log import IngredientLog
from app.models.storage import StorageBox, StorageType
from app.models.refrigerator import Refrigerator
from app.models.user import User
from app.models.ingredient_log import ActionType
from app.schemas.ingredient import IngredientCreate, ConsumeDisposeRequest
from app.schemas.recipe import GeneratedRecipe
from app.services import cooking_service, ingredient_service, storage_service, refrigerator_service
from tests.integration.test_consume_dispose import (
    auth_headers, inventory_sessions, transactional_client,  # noqa: F401
)
from tests.locking import bounded_settings, inventory_state, lock_snapshot, wait_edges

worker_name = contextvars.ContextVar("lock_probe_worker", default="observer")


def save_record(record):
    output = os.environ.get("RECIPICK_LOCK_PROBE_OUTPUT")
    if output:
        destination = Path(output)
        destination.mkdir(parents=True, exist_ok=True)
        (destination / f"{record['case']}.json").write_text(
            json.dumps(record, ensure_ascii=False, indent=2, default=str), encoding="utf-8",
        )


@pytest.mark.parametrize("release_first", ["A", "B"])
@pytest.mark.parametrize("quantity", [1, 5])
async def test_crossed_boxes_deadlock(
    transactional_client, inventory_sessions, test_engine, monkeypatch,
    release_first, quantity,
):
    sessions = inventory_sessions
    record = {"case": f"crossed-{release_first}-{quantity}", "sql": [], "errors": []}
    pids = {}
    ready = {name: asyncio.Event() for name in ["A", "B"]}
    statements = []

    async with sessions.begin() as db:
        db.add(StorageBox(id=101, refrigerator_id=10, name="Y", type=StorageType.FRIDGE))
        await db.flush()
        db.add_all([Ingredient(id=i, storage_box_id=box, name=f"item-{i}", quantity=5, unit="개")
                    for i, box in [(10, 100), (20, 101), (30, 100), (40, 101)]])
        plans = {}
        for name, user in [("A", 1), ("B", 2)]:
            plan = await cooking_service.create_plan(
                GeneratedRecipe(title="잠금 재현", recipe="테스트", requirements=[]), [10], user, 1, db,
            )
            plans[name] = plan.id
    bodies = {}
    for name, user, ids in [("A", 1, [10, 40]), ("B", 2, [20, 30])]:
        async with sessions() as db:
            preview = await cooking_service.preview(plans[name], user, db)
            bodies[name] = {"items": [dict(ingredient_id=item.ingredient_id,
                quantity=quantity, expected_token=item.token)
                for item in preview.stock if item.ingredient_id in ids]}
    record["before"] = await inventory_state(sessions)

    def capture_sql(conn, cursor, statement, parameters, context, executemany):
        name = worker_name.get()
        if name in {"A", "B"}:
            record["sql"].append({"worker": name, "statement": statement})
        if "FOR UPDATE OF ingredients, storage_boxes" in statement:
            statements.append((statement, parameters))

    def capture_error(context):
        error = context.original_exception
        record["errors"].append({"worker": worker_name.get(),
            "sqlstate": getattr(error, "sqlstate", None), "detail": str(error)})

    original_stock_rows = cooking_service.stock_rows

    async def observed_stock_rows(*args, **kwargs):
        db = args[1]
        name = worker_name.get()
        if kwargs.get("lock") and name in ready:
            await bounded_settings(db)
            pids[name] = await db.scalar(text("SELECT pg_backend_pid()"))
            ready[name].set()
        return await original_stock_rows(*args, **kwargs)

    monkeypatch.setattr(cooking_service, "stock_rows", observed_stock_rows)
    event.listen(test_engine.sync_engine, "before_cursor_execute", capture_sql)
    event.listen(test_engine.sync_engine, "handle_error", capture_error)
    tasks = []
    gates = {name: sessions() for name in ["A", "B"]}

    async def request(name, user):
        token = worker_name.set(name)
        try:
            response = await transactional_client.post(
                f"/api/v1/recipes/{plans[name]}/consume", json=bodies[name], headers=auth_headers(user),
            )
            return name, response.status_code, response.json()
        finally:
            worker_name.reset(token)

    try:
        # Run EXPLAIN ANALYZE on the exact captured driver SQL in an independent
        # transaction that is rolled back before the concurrency scenario.
        async with sessions() as baseline:
            await original_stock_rows([10], baseline, item_ids=[10, 40], lock=True)
            statement, parameters = statements[0]
            result = await (await baseline.connection()).exec_driver_sql(
                "EXPLAIN (ANALYZE, VERBOSE, BUFFERS, FORMAT JSON) " + statement, parameters,
            )
            record["explain_analyze"] = result.scalar()
        async with sessions() as observer:
            await bounded_settings(observer)
            record["environment"] = dict((await observer.execute(text("""
                SELECT version() AS version, current_database() AS database,
                       current_schema() AS schema,
                       current_setting('transaction_isolation') AS isolation,
                       current_setting('deadlock_timeout') AS deadlock_timeout
            """))).mappings().one())
            record["box_tuple_map"] = [dict(row) for row in (await observer.execute(text(
                "SELECT id, ctid::text FROM storage_boxes ORDER BY id"
            ))).mappings()]
            for name, ingredient_id in [("A", 40), ("B", 30)]:
                gate = gates[name]
                await bounded_settings(gate)
                pids[f"gate_{name}"] = await gate.scalar(text("SELECT pg_backend_pid()"))
                await gate.execute(select(Ingredient.id).where(
                    Ingredient.id == ingredient_id).with_for_update())

            tasks = [asyncio.create_task(request("A", 1)), asyncio.create_task(request("B", 2))]
            async with asyncio.timeout(8):
                await ready["A"].wait()
                await ready["B"].wait()
            record["pids"] = dict(pids)
            record["gated"] = await wait_edges(observer, list(pids.values()), [
                (pids["A"], pids["gate_A"]), (pids["B"], pids["gate_B"]),
            ])
            # NOWAIT probes certify each first box is already unavailable.
            record["box_probes"] = []
            for box in [100, 101]:
                async with sessions() as probe:
                    try:
                        await probe.execute(select(StorageBox.id).where(
                            StorageBox.id == box).with_for_update(nowait=True))
                    except Exception as error:
                        state = getattr(getattr(error, "orig", None), "sqlstate", None)
                        assert state == "55P03"
                        record["box_probes"].append({"box": box, "sqlstate": state})
                    else:
                        pytest.fail(f"First box {box} was not locked")

            statement, parameters = statements[0]
            plan = await (await observer.connection()).exec_driver_sql(
                "EXPLAIN (VERBOSE, FORMAT JSON) " + statement, parameters,
            )
            record["explain"] = plan.scalar()
            second = "B" if release_first == "A" else "A"
            await gates[release_first].rollback()
            record["one_gate_released"] = await wait_edges(observer, list(pids.values()), [
                (pids[release_first], pids[second]), (pids[second], pids[f"gate_{second}"]),
            ])
            await gates[second].rollback()
            record["cycle"] = await wait_edges(observer, list(pids.values()), [
                (pids["A"], pids["B"]), (pids["B"], pids["A"]),
            ])
            async with asyncio.timeout(15):
                results = await asyncio.gather(*tasks)
            record["responses"] = results
            assert sorted(result[1] for result in results) == [200, 500]
            assert sum(error["sqlstate"] == "40P01" for error in record["errors"]) == 1
            record["after"] = await inventory_state(sessions)
            winner = next(name for name, status, body in results if status == 200)
            loser = second if winner == release_first else release_first
            winner_user = 1 if winner == "A" else 2
            used = {10, 40} if winner == "A" else {20, 30}
            expected = [dict(row, quantity=row["quantity"] - quantity) if row["id"] in used else row
                        for row in record["before"]["stock"]]
            expected = [row for row in expected if row["quantity"] != 0]
            assert record["after"]["stock"] == expected
            assert record["after"]["logs"] == record["before"]["logs"] + [
                {"user_id": winner_user, "ingredient_id": i, "quantity": quantity} for i in sorted(used)]
            for plan in record["after"]["plans"]:
                if plan["user_id"] == winner_user:
                    assert plan["applied_at"] and plan["request_hash"] and plan["result"]
                else:
                    assert plan["applied_at"] is plan["request_hash"] is plan["result"] is None
            # Response-loss retry is idempotent, and the rolled-back request can
            # be retried with its original token because its inventory is intact.
            duplicate = await request(winner, winner_user)
            assert duplicate[1] == 200
            assert await inventory_state(sessions) == record["after"]
            retry = await request(loser, 1 if loser == "A" else 2)
            assert retry[1] == 200
            record["after_retry"] = await inventory_state(sessions)
            assert len(record["after_retry"]["logs"]) == len(record["before"]["logs"]) + 4
            final_stock = [dict(row, quantity=row["quantity"] - quantity)
                           if row["id"] in {10, 20, 30, 40} else row
                           for row in record["before"]["stock"]]
            assert record["after_retry"]["stock"] == [row for row in final_stock if row["quantity"] != 0]
            assert all(plan["applied_at"] for plan in record["after_retry"]["plans"])
            final = await lock_snapshot(observer, list(pids.values()))
            assert not [row for row in final["locks"] if row["locktype"] in {"relation", "transactionid", "tuple"}]
            record["connections_released_locks"] = True
    finally:
        for gate in gates.values():
            await gate.close()
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        event.remove(test_engine.sync_engine, "before_cursor_execute", capture_sql)
        event.remove(test_engine.sync_engine, "handle_error", capture_error)
        save_record(record)


async def test_cooking_against_box_reorder(
    transactional_client, inventory_sessions, test_engine, monkeypatch,
):
    """Real reorder endpoint takes Y then X while cooking takes X then Y."""
    sessions = inventory_sessions
    record = {"case": "cooking-reorder", "errors": []}
    pids = {}
    ready = asyncio.Event()
    async with sessions.begin() as db:
        db.add(StorageBox(id=101, refrigerator_id=10, name="Y", type=StorageType.FRIDGE, display_order=1))
        await db.flush()
        db.add_all([Ingredient(id=10, storage_box_id=100, name="X item", quantity=5, unit="개"),
                    Ingredient(id=40, storage_box_id=101, name="Y item", quantity=5, unit="개")])
        plan = await cooking_service.create_plan(
            GeneratedRecipe(title="정렬 충돌", recipe="테스트", requirements=[]), [10], 2, 1, db,
        )
    async with sessions() as db:
        view = await cooking_service.preview(plan.id, 2, db)
        body = {"items": [dict(ingredient_id=i.ingredient_id, quantity=1, expected_token=i.token)
                          for i in view.stock if i.ingredient_id in {10, 40}]}
    original_rows = cooking_service.stock_rows
    original_reorder = storage_service.reorder_storage_boxes

    async def observed_rows(ids, db, **kwargs):
        if kwargs.get("lock"):
            await bounded_settings(db)
            pids["cooking"] = await db.scalar(text("SELECT pg_backend_pid()"))
            ready.set()
        return await original_rows(ids, db, **kwargs)

    async def observed_reorder(refrigerator_id, ordered_ids, db):
        await bounded_settings(db)
        pids["reorder"] = await db.scalar(text("SELECT pg_backend_pid()"))
        return await original_reorder(refrigerator_id, ordered_ids, db)

    def capture_error(context):
        error = context.original_exception
        record["errors"].append({"sqlstate": getattr(error, "sqlstate", None), "detail": str(error)})

    from app.api.v1 import storage_boxes as storage_routes
    monkeypatch.setattr(cooking_service, "stock_rows", observed_rows)
    monkeypatch.setattr(storage_routes, "reorder_storage_boxes", observed_reorder)
    event.listen(test_engine.sync_engine, "handle_error", capture_error)
    tasks = []
    try:
        async with sessions() as gate, sessions() as observer:
            await bounded_settings(gate)
            await bounded_settings(observer)
            pids["gate"] = await gate.scalar(text("SELECT pg_backend_pid()"))
            await gate.execute(select(Ingredient.id).where(Ingredient.id == 40).with_for_update())
            tasks.append(asyncio.create_task(transactional_client.post(
                f"/api/v1/recipes/{plan.id}/consume", json=body, headers=auth_headers(2))))
            async with asyncio.timeout(8):
                await ready.wait()
            await wait_edges(observer, list(pids.values()), [(pids["cooking"], pids["gate"])])
            tasks.append(asyncio.create_task(transactional_client.put(
                "/api/v1/refrigerators/10/storage-boxes/reorder",
                json={"ordered_ids": [101, 100]}, headers=auth_headers(1))))
            async with asyncio.timeout(8):
                while "reorder" not in pids:
                    await asyncio.sleep(0.01)
            record["before_release"] = await wait_edges(observer, list(pids.values()), [
                (pids["cooking"], pids["gate"]), (pids["reorder"], pids["cooking"]),
            ])
            await gate.rollback()
            record["cycle"] = await wait_edges(observer, list(pids.values()), [
                (pids["cooking"], pids["reorder"]), (pids["reorder"], pids["cooking"]),
            ])
            async with asyncio.timeout(15):
                responses = await asyncio.gather(*tasks)
            record["pids"] = pids
            record["statuses"] = [response.status_code for response in responses]
            assert record["statuses"] in ([500, 204], [200, 500])
            assert any(error["sqlstate"] == "40P01" for error in record["errors"])
            record["after"] = await inventory_state(sessions)
            async with sessions() as db:
                record["box_orders"] = [list(row) for row in (await db.execute(
                    select(StorageBox.id, StorageBox.display_order).order_by(StorageBox.id))).all()]
            if responses[0].status_code == 500:
                assert all(row["quantity"] == 5 for row in record["after"]["stock"] if row["id"] in {10, 40})
                assert len(record["after"]["logs"]) == 1
                assert record["after"]["plans"][0]["applied_at"] is None
                assert record["box_orders"] == [[100, 1], [101, 0], [200, 0]]
            else:
                assert len(record["after"]["logs"]) == 3
                assert record["after"]["plans"][0]["applied_at"] is not None
                assert record["box_orders"] == [[100, 0], [101, 1], [200, 0]]
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        event.remove(test_engine.sync_engine, "handle_error", capture_error)
        save_record(record)


@pytest.mark.parametrize("operation", ["create", "consume", "delete_box", "delete_fridge"])
async def test_related_sql_and_foreign_key_locks(inventory_sessions, test_engine, operation):
    """Observe real service DML and RI lock compatibility, then roll it back."""
    sessions = inventory_sessions
    record = {"case": f"related-{operation}", "sql": [], "fk_probes": []}

    def capture(conn, cursor, statement, parameters, context, executemany):
        if worker_name.get() == "related":
            record["sql"].append(statement)

    event.listen(test_engine.sync_engine, "before_cursor_execute", capture)
    token = worker_name.set("related")
    before = await inventory_state(sessions)
    try:
        async with sessions() as db:
            await bounded_settings(db)
            pid = await db.scalar(text("SELECT pg_backend_pid()"))
            if operation == "create":
                await ingredient_service.create_ingredient(100, IngredientCreate(name="probe"), db)
                parents = [(StorageBox, 100)]
            elif operation == "consume":
                await ingredient_service.consume_or_dispose_ingredient(
                    1000, 100, 1, "우리 냉장고", 10, ActionType.CONSUMED,
                    ConsumeDisposeRequest(quantity=1), db,
                )
                parents = [(User, 1), (Refrigerator, 10)]
            elif operation == "delete_box":
                await storage_service.delete_storage_box(100, 10, db)
                parents = []
            else:
                await refrigerator_service.delete_refrigerator(10, 1, db)
                parents = []
            async with sessions() as observer:
                record["locks"] = await lock_snapshot(observer, [pid])
            for model, row_id in parents:
                for mode in ["no_key_update", "update"]:
                    async with sessions() as probe:
                        query = select(model.id).where(model.id == row_id).with_for_update(
                            nowait=True, key_share=mode == "no_key_update")
                        try:
                            await probe.execute(query)
                        except Exception as error:
                            state = getattr(getattr(error, "orig", None), "sqlstate", None)
                            assert state == "55P03" and mode == "update"
                            record["fk_probes"].append([model.__tablename__, mode, state])
                        else:
                            assert mode == "no_key_update"
                            record["fk_probes"].append([model.__tablename__, mode, "acquired"])
        assert await inventory_state(sessions) == before
        record["rollback_preserved_inventory"] = True
    finally:
        worker_name.reset(token)
        event.remove(test_engine.sync_engine, "before_cursor_execute", capture)
        save_record(record)


async def test_cooking_against_refrigerator_delete(
    transactional_client, inventory_sessions, test_engine, monkeypatch,
):
    """Pause between real SQL statements, without adding any gating DB locks."""
    from app.api.v1 import refrigerators as fridge_routes

    sessions = inventory_sessions
    record = {"case": "cooking-fridge-delete", "errors": []}
    pids = {}
    ready, proceed = asyncio.Event(), asyncio.Event()
    async with sessions.begin() as db:
        plan = await cooking_service.create_plan(
            GeneratedRecipe(title="삭제 충돌", recipe="테스트", requirements=[]), [10], 2, 1, db,
        )
    async with sessions() as db:
        view = await cooking_service.preview(plan.id, 2, db)
        body = {"items": [dict(ingredient_id=1000, quantity=1, expected_token=view.stock[0].token)]}
    before = await inventory_state(sessions)
    original_rows = cooking_service.stock_rows
    original_delete = refrigerator_service.delete_refrigerator

    async def paused_rows(ids, db, **kwargs):
        if kwargs.get("lock"):
            await bounded_settings(db)
            pids["cooking"] = await db.scalar(text("SELECT pg_backend_pid()"))
            ready.set()
            await proceed.wait()
        return await original_rows(ids, db, **kwargs)

    async def observed_delete(refrigerator_id, user_id, db):
        await bounded_settings(db)
        pids["delete"] = await db.scalar(text("SELECT pg_backend_pid()"))
        return await original_delete(refrigerator_id, user_id, db)

    def capture_error(context):
        error = context.original_exception
        record["errors"].append({"sqlstate": getattr(error, "sqlstate", None), "detail": str(error)})

    monkeypatch.setattr(cooking_service, "stock_rows", paused_rows)
    monkeypatch.setattr(fridge_routes, "delete_refrigerator", observed_delete)
    event.listen(test_engine.sync_engine, "handle_error", capture_error)
    tasks = []
    try:
        tasks.append(asyncio.create_task(transactional_client.post(
            f"/api/v1/recipes/{plan.id}/consume", json=body, headers=auth_headers(2))))
        async with asyncio.timeout(8):
            await ready.wait()
        tasks.append(asyncio.create_task(transactional_client.delete(
            "/api/v1/refrigerators/10", headers=auth_headers(1))))
        async with asyncio.timeout(8):
            while "delete" not in pids:
                await asyncio.sleep(0.01)
        async with sessions() as observer:
            await bounded_settings(observer)
            record["delete_waiting"] = await wait_edges(observer, list(pids.values()), [
                (pids["delete"], pids["cooking"]),
            ])
            proceed.set()
            record["cycle"] = await wait_edges(observer, list(pids.values()), [
                (pids["cooking"], pids["delete"]), (pids["delete"], pids["cooking"]),
            ])
        async with asyncio.timeout(15):
            responses = await asyncio.gather(*tasks)
        record["pids"] = pids
        record["statuses"] = [response.status_code for response in responses]
        assert record["statuses"] in ([500, 204], [200, 500])
        assert any(error["sqlstate"] == "40P01" for error in record["errors"])
        record["after"] = await inventory_state(sessions)
        async with sessions() as db:
            fridge_exists = await db.get(Refrigerator, 10) is not None
            record["fridge_exists"] = fridge_exists
        if responses[0].status_code == 200:
            assert fridge_exists
            assert len(record["after"]["logs"]) == len(before["logs"]) + 1
            assert record["after"]["stock"][0]["quantity"] == 4.5
            assert record["after"]["plans"][0]["applied_at"] is not None
        else:
            assert not fridge_exists
            assert record["after"]["stock"] == [row for row in before["stock"] if row["storage_box_id"] != 100]
            assert record["after"]["logs"] == before["logs"]
            assert record["after"]["plans"][0]["applied_at"] is None
    finally:
        proceed.set()
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        event.remove(test_engine.sync_engine, "handle_error", capture_error)
        save_record(record)
