"""Observe real PostgreSQL waits and control transactions for lock regressions."""
import asyncio
import contextvars
from contextlib import asynccontextmanager
from datetime import date
from types import SimpleNamespace

import pytest
from sqlalchemy import delete, event, select, text, update
from sqlalchemy.orm import Session

from app.models.cooking_plan import CookingPlan
from app.models.ingredient import Ingredient
from app.models.ingredient_log import IngredientLog
from app.models.refrigerator import MemberRole, Refrigerator, RefrigeratorMember
from app.models.storage import StorageBox, StorageType
from app.schemas.recipe import GeneratedRecipe
from app.services import cooking_service, refrigerator_service, storage_service
from tests.locking import bounded_settings, inventory_state, wait_edges
from tests.integration.test_consume_dispose import (
    auth_headers, inventory_sessions, transactional_client,  # noqa: F401
)

request_name = contextvars.ContextVar("inventory_lock_request", default=None)


@pytest.fixture
async def stock(inventory_sessions):
    async with inventory_sessions.begin() as db:
        db.add(StorageBox(id=101, refrigerator_id=10, name="Y", type=StorageType.FRIDGE, display_order=1))
        await db.flush()
        db.add_all([Ingredient(id=i, storage_box_id=box, name=f"item-{i}", quantity=5, unit="개")
                    for i, box in [(10, 100), (20, 101), (30, 100), (40, 101)]])
    return inventory_sessions


async def make_plan(sessions, user, ids, quantity=1, refrigerator_ids=None):
    async with sessions.begin() as db:
        plan = await cooking_service.create_plan(
            GeneratedRecipe(title="잠금 회귀", recipe="테스트", requirements=[]),
            refrigerator_ids or [10], user, 1, db,
        )
    async with sessions() as db:
        view = await cooking_service.preview(plan.id, user, db)
    body = {"items": [dict(ingredient_id=item.ingredient_id, quantity=quantity, expected_token=item.token)
                      for item in view.stock if item.ingredient_id in ids]}
    assert len(body["items"]) == len(ids)
    return f"/api/v1/recipes/{plan.id}/consume", body


@pytest.fixture
async def probe(transactional_client, test_engine):
    pids, sql, errors, tasks = {}, {}, [], []

    def began(session, transaction, conn):
        name = request_name.get()
        if name and conn.engine is test_engine.sync_engine:
            conn.exec_driver_sql("SET LOCAL statement_timeout = '12s'")
            conn.exec_driver_sql("SET LOCAL lock_timeout = '10s'")
            pids[name] = conn.scalar(text("SELECT pg_backend_pid()"))

    def executed(conn, cursor, statement, parameters, context, executemany):
        name = request_name.get()
        if name:
            sql.setdefault(name, []).append(statement)

    def failed(context):
        if request_name.get():
            errors.append(getattr(context.original_exception, "sqlstate", None))

    async def request(name, method, path, user=1, body=None):
        token = request_name.set(name)
        try:
            return await transactional_client.request(method, path, headers=auth_headers(user), json=body)
        finally:
            request_name.reset(token)

    async def start(name, method, path, user=1, body=None):
        task = asyncio.create_task(request(name, method, path, user, body))
        tasks.append(task)
        async with asyncio.timeout(8):
            while name not in pids:
                if task.done():
                    pytest.fail(f"{name} ended before opening its test transaction: {task.result().status_code}")
                await asyncio.sleep(0.01)
        return task

    event.listen(Session, "after_begin", began)
    event.listen(test_engine.sync_engine, "before_cursor_execute", executed)
    event.listen(test_engine.sync_engine, "handle_error", failed)
    try:
        yield SimpleNamespace(pids=pids, sql=sql, start=start, errors=errors)
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        event.remove(Session, "after_begin", began)
        event.remove(test_engine.sync_engine, "before_cursor_execute", executed)
        event.remove(test_engine.sync_engine, "handle_error", failed)
        assert "40P01" not in errors


@asynccontextmanager
async def gate(sessions, model, row_id):
    async with sessions() as db:
        await bounded_settings(db)
        pid = await db.scalar(text("SELECT pg_backend_pid()"))
        await db.execute(select(model.id).where(model.id == row_id).with_for_update())
        yield db, pid


async def finish(task, status):
    response = await asyncio.wait_for(task, 8)
    assert response.status_code == status, response.text
    return response


@pytest.mark.parametrize("first", ["A", "B"])
@pytest.mark.parametrize("quantity", [1, 5])
async def test_crossed_boxes_both_complete_and_independent_transactions_overlap(stock, probe, first, quantity):
    plans = {"A": await make_plan(stock, 1, [10, 40], quantity),
             "B": await make_plan(stock, 2, [20, 30], quantity)}
    async with gate(stock, Ingredient, 40) as (gate_a, pid_a), gate(stock, Ingredient, 30) as (gate_b, pid_b):
        tasks = {name: await probe.start(name, "POST", path, user, body)
                 for name, user, (path, body) in [("A", 1, plans["A"]), ("B", 2, plans["B"]) ]}
        async with stock() as observer:
            await wait_edges(observer, [*probe.pids.values(), pid_a, pid_b], [
                (probe.pids["A"], pid_a), (probe.pids["B"], pid_b),
            ])
        # Both requests reached their ingredient gates while holding the same
        # two boxes, proving that their parent locks are compatible.
        gates = {"A": gate_a, "B": gate_b}
        second = "B" if first == "A" else "A"
        await gates[first].rollback()
        await finish(tasks[first], 200)
        assert not tasks[second].done()
        await gates[second].rollback()
        await finish(tasks[second], 200)
    state = await inventory_state(stock)
    selected = [row for row in state["stock"] if row["id"] in {10, 20, 30, 40}]
    assert selected == ([] if quantity == 5 else [
        {"id": i, "quantity": 4, "storage_box_id": box}
        for i, box in [(10, 100), (20, 101), (30, 100), (40, 101)]])
    assert len(state["logs"]) == 5
    assert all(plan["applied_at"] and plan["result"] for plan in state["plans"])
    for name in ["A", "B"]:
        statements = probe.sql[name]
        box_lock = next(i for i, sql in enumerate(statements) if "FROM storage_boxes" in sql and "FOR SHARE" in sql)
        item_lock = next(i for i, sql in enumerate(statements) if "FOR UPDATE OF ingredients" in sql)
        assert box_lock < item_lock
        assert "ORDER BY storage_boxes.id" in statements[box_lock]
        assert "ORDER BY ingredients.id" in statements[item_lock]
        assert "FOR UPDATE OF ingredients, storage_boxes" not in statements[item_lock]
    for name, user in [("A", 1), ("B", 2)]:
        path, body = plans[name]
        await finish(await probe.start(f"retry-{name}", "POST", path, user, body), 200)
    assert await inventory_state(stock) == state


MANAGEMENT = {
    "reorder": ("PUT", "/api/v1/refrigerators/10/storage-boxes/reorder", {"ordered_ids": [101, 100]}),
    "delete_box": ("DELETE", "/api/v1/refrigerators/10/storage-boxes/100", None),
    "delete_fridge": ("DELETE", "/api/v1/refrigerators/10", None),
}


@pytest.mark.parametrize("action", MANAGEMENT)
@pytest.mark.parametrize("first", ["cooking", "management"])
async def test_management_and_cooking_use_the_same_parent_order(stock, probe, monkeypatch, action, first):
    path, body = await make_plan(stock, 2, [10, 40])
    method, manage_path, manage_body = MANAGEMENT[action]
    if first == "cooking":
        async with gate(stock, Ingredient, 40) as (blocked, gate_pid), stock() as observer:
            cooking = await probe.start("cooking", "POST", path, 2, body)
            await wait_edges(observer, [probe.pids["cooking"], gate_pid], [(probe.pids["cooking"], gate_pid)])
            management = await probe.start("management", method, manage_path, 1, manage_body)
            await wait_edges(observer, list(probe.pids.values()), [(probe.pids["management"], probe.pids["cooking"])])
            await blocked.rollback()
            await finish(cooking, 200)
            await finish(management, 204)
    else:
        ready, proceed = asyncio.Event(), asyncio.Event()
        service = refrigerator_service if action == "delete_fridge" else storage_service
        original = service.lock_storage_boxes

        async def pause_after_boxes(*args, **kwargs):
            boxes = await original(*args, **kwargs)
            ready.set()
            await asyncio.wait_for(proceed.wait(), 8)
            return boxes

        monkeypatch.setattr(service, "lock_storage_boxes", pause_after_boxes)
        try:
            management = await probe.start("management", method, manage_path, 1, manage_body)
            await asyncio.wait_for(ready.wait(), 8)
            cooking = await probe.start("cooking", "POST", path, 2, body)
            async with stock() as observer:
                await wait_edges(observer, list(probe.pids.values()), [(probe.pids["cooking"], probe.pids["management"])])
            proceed.set()
            await finish(management, 204)
            await finish(cooking, {"reorder": 200, "delete_box": 409, "delete_fridge": 403}[action])
        finally:
            proceed.set()
    state = await inventory_state(stock)
    applied = first == "cooking" or action == "reorder"
    assert len(state["logs"]) == (3 if applied else 1)
    assert bool(state["plans"][0]["applied_at"]) == applied
    if action == "reorder":
        async with stock() as db:
            assert (await db.scalars(select(StorageBox.display_order).where(
                StorageBox.id.in_([100, 101])).order_by(StorageBox.id))).all() == [1, 0]
    if action == "delete_box":
        assert not [row for row in state["stock"] if row["storage_box_id"] == 100]
    if action == "delete_fridge":
        assert [row["id"] for row in state["stock"]] == [2000]
        async with stock() as db:
            assert not await db.scalar(select(Refrigerator.id).where(Refrigerator.id == 10))
            assert all(value is None for value in (await db.scalars(select(IngredientLog.refrigerator_id))).all())


@pytest.mark.parametrize("change", ["box_name", "fridge_name", "name", "quantity", "unit", "expiry_date"])
async def test_state_token_rechecks_values_after_lock_wait(stock, probe, change):
    path, body = await make_plan(stock, 1, [10, 40])
    before = await inventory_state(stock)
    model = StorageBox if change == "box_name" else Refrigerator if change == "fridge_name" else Ingredient
    row_id = 100 if change == "box_name" else 10
    field = "name" if change in {"box_name", "fridge_name"} else change
    value = {"name": "changed", "quantity": 4, "unit": "kg", "expiry_date": date(2027, 1, 1)}[field]
    async with gate(stock, model, row_id) as (editor, editor_pid), stock() as observer:
        await editor.execute(update(model).where(model.id == row_id).values(**{field: value}))
        cooking = await probe.start("cooking", "POST", path, 1, body)
        await wait_edges(observer, [probe.pids["cooking"], editor_pid], [(probe.pids["cooking"], editor_pid)])
        await editor.commit()
        response = await finish(cooking, 409)
        assert response.json()["detail"]["code"] == "inventory_changed"
    state = await inventory_state(stock)
    assert state["logs"] == before["logs"]
    assert state["plans"] == before["plans"]
    expected = before["stock"]
    if change == "quantity":
        expected = [dict(row, quantity=4) if row["id"] == 10 else row for row in expected]
    assert state["stock"] == expected


async def test_item_moved_to_unlocked_box_is_rejected(stock, probe, monkeypatch):
    path, body = await make_plan(stock, 1, [10])
    ready, proceed = asyncio.Event(), asyncio.Event()
    original = cooking_service.lock_storage_boxes

    async def pause_after_boxes(*args, **kwargs):
        boxes = await original(*args, **kwargs)
        assert [box.id for box in boxes] == [100]
        ready.set()
        await asyncio.wait_for(proceed.wait(), 8)
        return boxes

    monkeypatch.setattr(cooking_service, "lock_storage_boxes", pause_after_boxes)
    try:
        cooking = await probe.start("cooking", "POST", path, 1, body)
        await asyncio.wait_for(ready.wait(), 8)
        async with stock.begin() as editor:
            await bounded_settings(editor)
            await editor.execute(update(Ingredient).where(Ingredient.id == 10).values(storage_box_id=101))
        proceed.set()
        await finish(cooking, 409)
    finally:
        proceed.set()
    state = await inventory_state(stock)
    assert len(state["logs"]) == 1
    assert state["stock"][0] == {"id": 10, "quantity": 5, "storage_box_id": 101}


WRITES = {
    "create": ("POST", "/api/v1/storage-boxes/100/ingredients", {"name": "new"}),
    "update": ("PUT", "/api/v1/storage-boxes/100/ingredients/10", {"name": "changed"}),
    "consume": ("POST", "/api/v1/storage-boxes/100/ingredients/10/consume", {"quantity": 1}),
    "dispose": ("POST", "/api/v1/storage-boxes/100/ingredients/10/dispose", {"quantity": 1}),
    "batch": ("POST", "/api/v1/storage-boxes/100/ingredients/batch", {"items": [{"name": "new"}]}),
}


@pytest.mark.parametrize("action", ["cooking", *WRITES])
async def test_access_revoked_during_fridge_wait_prevents_writes(stock, probe, action):
    if action == "cooking":
        path, body = await make_plan(stock, 2, [10])
        method = "POST"
    else:
        method, path, body = WRITES[action]
    before = await inventory_state(stock)
    async with gate(stock, Refrigerator, 10) as (removal, removal_pid), stock() as observer:
        await removal.execute(delete(RefrigeratorMember).where(
            RefrigeratorMember.refrigerator_id == 10, RefrigeratorMember.user_id == 2))
        operation = await probe.start("write", method, path, 2, body)
        await wait_edges(observer, [probe.pids["write"], removal_pid], [(probe.pids["write"], removal_pid)])
        await removal.commit()
        await finish(operation, 403)
    assert await inventory_state(stock) == before


@pytest.mark.parametrize("action", ["create", "batch"])
async def test_registration_can_complete_during_cooking_with_shared_box(stock, probe, action):
    path, body = await make_plan(stock, 1, [10])
    async with gate(stock, Ingredient, 10) as (blocked, pid), stock() as observer:
        cooking = await probe.start("cooking", "POST", path, 1, body)
        await wait_edges(observer, [probe.pids["cooking"], pid], [(probe.pids["cooking"], pid)])
        method, create_path, create_body = WRITES[action]
        await finish(await probe.start("create", method, create_path, 2, create_body), 201)
        assert not cooking.done()
        await blocked.rollback()
        await finish(cooking, 200)


@pytest.mark.parametrize("action", ["delete", "dispose"])
async def test_single_consume_and_bulk_action_have_no_fk_lock_inversion(stock, probe, action):
    async with gate(stock, Ingredient, 10) as (blocked, pid), stock() as observer:
        consume = await probe.start("consume", "POST", "/api/v1/storage-boxes/100/ingredients/10/consume", 2,
                                    {"quantity": 1})
        await wait_edges(observer, [probe.pids["consume"], pid], [(probe.pids["consume"], pid)])
        bulk = await probe.start("bulk", "POST", "/api/v1/storage-boxes/100/ingredients/bulk-action", 1,
            {"action": action, "items": [dict(id=10, name="item-10", quantity=5, unit="개", expiry_date=None)]})
        await wait_edges(observer, list(probe.pids.values()), [(probe.pids["bulk"], probe.pids["consume"])])
        await blocked.rollback()
        await finish(consume, 200)
        await finish(bulk, 409)
    state = await inventory_state(stock)
    assert state["stock"][0]["quantity"] == 4
    assert len(state["logs"]) == 2


@pytest.mark.parametrize("quantity", [1, 5])
async def test_commit_failure_rolls_back_all_locked_inventory(stock, probe, quantity):
    path, body = await make_plan(stock, 1, [10, 40], quantity)
    before = await inventory_state(stock)
    reached = []

    def reject_commit(session):
        if request_name.get() == "cooking":
            reached.append(True)
            raise RuntimeError("injected commit failure after service flush")

    event.listen(Session, "before_commit", reject_commit)
    try:
        await finish(await probe.start("cooking", "POST", path, 1, body), 500)
    finally:
        event.remove(Session, "before_commit", reject_commit)
    assert reached == [True]
    assert await inventory_state(stock) == before


async def test_multiple_fridges_lock_in_id_order_for_legacy_unsorted_plan(stock, probe):
    async with stock.begin() as db:
        db.add_all([RefrigeratorMember(refrigerator_id=20, user_id=user, role=MemberRole.GUEST) for user in [1, 2]])
        db.add(Ingredient(id=2001, storage_box_id=200, name="outside", quantity=5, unit="개"))
    a_path, a_body = await make_plan(stock, 1, [10, 2000], refrigerator_ids=[20, 10])
    b_path, b_body = await make_plan(stock, 2, [20, 2001], refrigerator_ids=[10, 20])
    async with stock.begin() as db:
        await db.execute(update(CookingPlan).where(CookingPlan.user_id == 1).values(refrigerator_ids=[20, 10]))
    async with gate(stock, Refrigerator, 20) as (blocked, pid), stock() as observer:
        a = await probe.start("A", "POST", a_path, 1, a_body)
        b = await probe.start("B", "POST", b_path, 2, b_body)
        await wait_edges(observer, [*probe.pids.values(), pid], [(probe.pids["A"], pid), (probe.pids["B"], pid)])
        async with stock() as check:
            with pytest.raises(Exception) as error:
                await check.execute(select(Refrigerator.id).where(Refrigerator.id == 10).with_for_update(nowait=True))
            assert getattr(error.value.orig, "sqlstate", None) == "55P03"
        await blocked.rollback()
        await finish(a, 200)
        await finish(b, 200)
    assert len((await inventory_state(stock))["logs"]) == 5


@pytest.mark.parametrize("action", ["delete", "dispose"])
async def test_bulk_action_first_makes_single_consume_wait_before_ingredient(stock, probe, monkeypatch, action):
    from app.api.v1 import ingredients as routes

    ready, proceed = asyncio.Event(), asyncio.Event()
    original = routes.bulk_action_ingredients

    async def paused_bulk(*args, **kwargs):
        ready.set()
        await asyncio.wait_for(proceed.wait(), 8)
        return await original(*args, **kwargs)

    monkeypatch.setattr(routes, "bulk_action_ingredients", paused_bulk)
    try:
        bulk = await probe.start("bulk", "POST", "/api/v1/storage-boxes/100/ingredients/bulk-action", 1,
            {"action": action, "items": [dict(id=10, name="item-10", quantity=5, unit="개", expiry_date=None)]})
        await asyncio.wait_for(ready.wait(), 8)
        consume = await probe.start("consume", "POST", "/api/v1/storage-boxes/100/ingredients/10/consume", 2,
                                    {"quantity": 1})
        async with stock() as observer:
            await wait_edges(observer, list(probe.pids.values()), [(probe.pids["consume"], probe.pids["bulk"])])
        proceed.set()
        await finish(bulk, 204)
        await finish(consume, 404)
    finally:
        proceed.set()
    state = await inventory_state(stock)
    assert all(row["id"] != 10 for row in state["stock"])
    assert len(state["logs"]) == (2 if action == "dispose" else 1)


@pytest.mark.parametrize("operation", ["remove_member", "distributed_import"])
async def test_fridge_exclusive_operations_wait_for_cooking(stock, probe, operation):
    path, body = await make_plan(stock, 2, [10])
    async with gate(stock, Ingredient, 10) as (blocked, pid), stock() as observer:
        cooking = await probe.start("cooking", "POST", path, 2, body)
        await wait_edges(observer, [probe.pids["cooking"], pid], [(probe.pids["cooking"], pid)])
        if operation == "remove_member":
            other = await probe.start("other", "DELETE", "/api/v1/refrigerators/10/members/2")
            status = 204
        else:
            other = await probe.start("other", "POST", "/api/v1/refrigerators/10/ingredients/batch", 1,
                {"items": [{"name": "new-Y", "storage_box_id": 101}, {"name": "new-X", "storage_box_id": 100}]})
            status = 201
        await wait_edges(observer, list(probe.pids.values()), [(probe.pids["other"], probe.pids["cooking"])])
        await blocked.rollback()
        await finish(cooking, 200)
        await finish(other, status)
    assert len((await inventory_state(stock))["logs"]) == 2


async def test_same_box_different_ingredients_can_finish_independently(stock, probe):
    a_path, a_body = await make_plan(stock, 1, [10])
    b_path, b_body = await make_plan(stock, 2, [30])
    async with gate(stock, Ingredient, 10) as (blocked, pid), stock() as observer:
        a = await probe.start("A", "POST", a_path, 1, a_body)
        await wait_edges(observer, [probe.pids["A"], pid], [(probe.pids["A"], pid)])
        await finish(await probe.start("B", "POST", b_path, 2, b_body), 200)
        assert not a.done()
        await blocked.rollback()
        await finish(a, 200)
    state = await inventory_state(stock)
    assert [row["quantity"] for row in state["stock"] if row["id"] in {10, 30}] == [4, 4]
    assert len(state["logs"]) == 3


@pytest.mark.parametrize("operation", [*MANAGEMENT, "reorder_fridges"])
async def test_management_commit_failure_reports_error_and_rolls_back(stock, probe, operation):
    async def state():
        async with stock() as db:
            return {model.__tablename__: (await db.execute(select(model.__table__).order_by(model.id))).all()
                    for model in [Refrigerator, RefrigeratorMember, StorageBox, Ingredient, IngredientLog]}

    if operation == "reorder_fridges":
        async with stock.begin() as db:
            db.add(RefrigeratorMember(refrigerator_id=20, user_id=1, role=MemberRole.GUEST, display_order=1))
        method, path, body = "PUT", "/api/v1/refrigerators/reorder", {"ordered_ids": [20, 10]}
    else:
        method, path, body = MANAGEMENT[operation]
    before = await state()
    reached = []

    def reject_commit(session):
        if request_name.get() == "management":
            reached.append(True)
            raise RuntimeError("injected management commit failure")

    event.listen(Session, "before_commit", reject_commit)
    try:
        await finish(await probe.start("management", method, path, 1, body), 500)
    finally:
        event.remove(Session, "before_commit", reject_commit)
    assert reached == [True]
    assert await state() == before
