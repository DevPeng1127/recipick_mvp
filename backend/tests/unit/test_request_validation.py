from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import Request
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.dependencies.auth import (
    get_current_user,
    require_refrigerator_member,
    require_storage_box_member,
)
from app.main import app
from app.models.ingredient import Ingredient
from app.models.ingredient_log import ActionType, IngredientLog
from app.models.refrigerator import Refrigerator
from app.models.storage import StorageBox, StorageType


INGREDIENTS = "/api/v1/storage-boxes/10/ingredients"
BOXES = "/api/v1/refrigerators/1/storage-boxes"
FRIDGES = "/api/v1/refrigerators"
NAME_ROUTES = [
    ("POST", INGREDIENTS, {}),
    ("PUT", f"{INGREDIENTS}/20", {}),
    ("POST", BOXES, {"type": "FRIDGE"}),
    ("PUT", f"{BOXES}/10", {}),
    ("POST", FRIDGES, {}),
    ("PUT", f"{FRIDGES}/1", {}),
]
QUANTITY_ROUTES = [
    ("POST", INGREDIENTS, {"name": "우유"}),
    ("PUT", f"{INGREDIENTS}/20", {}),
    ("POST", f"{INGREDIENTS}/20/consume", {}),
    ("POST", f"{INGREDIENTS}/20/dispose", {}),
]


@pytest.fixture
def inventory():
    # Exercise real routes and services with isolated DB I/O, never the configured DB.
    db = AsyncMock(spec=AsyncSession)
    db.execute.return_value = MagicMock()
    fridge = Refrigerator(id=1, name="우리 집", created_at=datetime(2026, 1, 1))
    box = StorageBox(id=10, refrigerator_id=1, name="냉장실", type=StorageType.FRIDGE)
    ingredient = Ingredient(
        id=20, storage_box_id=10, name="우유", quantity=2.5, unit="L",
        expiry_date=date(2026, 12, 31), expiry_source="unknown",
    )
    db.scalar.return_value = fridge
    db.scalars.return_value = MagicMock()
    db.scalars.return_value.all.return_value = [box]
    db.execute.return_value.scalar_one.return_value = fridge
    db.execute.return_value.scalar_one_or_none.return_value = ingredient

    async def flush():
        for call in db.add.call_args_list:
            row = call.args[0]
            if row.id is None:
                row.id = 30
            if isinstance(row, Refrigerator) and row.created_at is None:
                row.created_at = datetime(2026, 1, 1)

    db.flush.side_effect = flush
    return SimpleNamespace(db=db, fridge=fridge, box=box, ingredient=ingredient)


@pytest.fixture
async def validation_client(inventory):
    async def override_db(request: Request):
        if request.url.path.startswith(BOXES):
            inventory.db.execute.return_value.scalar_one_or_none.return_value = inventory.box
        elif request.url.path.startswith(FRIDGES):
            inventory.db.execute.return_value.scalar_one_or_none.return_value = inventory.fridge
        yield inventory.db

    previous = app.dependency_overrides.copy()
    app.dependency_overrides.update({
        get_db: override_db,
        get_current_user: lambda: SimpleNamespace(id=1),
        require_refrigerator_member: lambda: SimpleNamespace(user_id=1, role="OWNER"),
        require_storage_box_member: lambda: inventory.box,
    })
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://test",
        ) as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)


def assert_rejected(response, inventory, field):
    assert response.status_code == 422, response.text
    # Union types can append the failed branch after the field location.
    assert any(error["loc"][:2] == ["body", field] for error in response.json()["detail"])
    inventory.db.execute.assert_not_awaited()
    inventory.db.add.assert_not_called()
    inventory.db.flush.assert_not_awaited()
    inventory.db.delete.assert_not_awaited()


@pytest.mark.parametrize("method,path,base", NAME_ROUTES)
@pytest.mark.parametrize("name", ["", " \t\n", "가" * 101, None])
async def test_invalid_names_rejected_before_storage(
    method, path, base, name, validation_client, inventory
):
    response = await validation_client.request(method, path, json={**base, "name": name})
    assert_rejected(response, inventory, "name")


@pytest.mark.parametrize("method,path,base", QUANTITY_ROUTES)
@pytest.mark.parametrize("quantity", [-1, 0, "NaN", "Infinity", "-Infinity", True, "2"])
async def test_invalid_quantities_rejected_before_storage(
    method, path, base, quantity, validation_client, inventory
):
    response = await validation_client.request(
        method, path, json={**base, "quantity": quantity}
    )
    assert_rejected(response, inventory, "quantity")


@pytest.mark.parametrize("method,path,base", QUANTITY_ROUTES)
@pytest.mark.parametrize("number", ["NaN", "Infinity", "-Infinity", "1e400"])
async def test_nonfinite_json_numbers_return_validation_error(
    method, path, base, number, validation_client, inventory
):
    # 1e400 is valid JSON syntax but overflows a float. NaN/Infinity are also
    # accepted by Python's JSON parser; error responses must remain valid JSON.
    name = '"name": "milk",' if "name" in base else ""
    response = await validation_client.request(
        method, path, content='{' + name + '"quantity":' + number + '}',
        headers={"Content-Type": "application/json"},
    )
    assert_rejected(response, inventory, "quantity")


@pytest.mark.parametrize("method,path,base", QUANTITY_ROUTES[:2])
@pytest.mark.parametrize("unit", ["", " \t", "단" * 21, None])
async def test_invalid_units_rejected(method, path, base, unit, validation_client, inventory):
    response = await validation_client.request(method, path, json={**base, "unit": unit})
    assert_rejected(response, inventory, "unit")


@pytest.mark.parametrize("method,path,body,field", [
    ("POST", INGREDIENTS, {"name": "우유", "quantity": None}, "quantity"),
    ("PUT", f"{INGREDIENTS}/20", {"quantity": None}, "quantity"),
    ("POST", BOXES, {"name": "냉장실", "type": None}, "type"),
    ("PUT", f"{BOXES}/10", {"type": None}, "type"),
])
async def test_required_values_cannot_be_cleared(
    method, path, body, field, validation_client, inventory
):
    response = await validation_client.request(method, path, json=body)
    assert_rejected(response, inventory, field)


@pytest.mark.parametrize("method,path,base", NAME_ROUTES)
async def test_names_trimmed_and_database_limit_accepted(
    method, path, base, validation_client, inventory
):
    # Exactly 100 characters after trimming, with internal spaces preserved.
    name = "가 나 " * 24 + "가 나라"
    response = await validation_client.request(
        method, path, json={**base, "name": f" \t{name}\n "}
    )
    assert response.status_code == (201 if method == "POST" else 200), response.text
    assert response.json()["name"] == name
    inventory.db.flush.assert_awaited()


async def test_ingredient_defaults_preserved(validation_client, inventory):
    response = await validation_client.post(INGREDIENTS, json={"name": "두부"})
    assert response.status_code == 201
    assert response.json()["quantity"] == 1
    assert response.json()["unit"] == "개"
    assert response.json()["expiry_date"] is None


async def test_decimal_quantity_custom_unit_and_expiry_accepted(validation_client, inventory):
    response = await validation_client.post(INGREDIENTS, json={
        "name": "우유", "quantity": 0.5, "unit": " " + "단" * 20 + " ",
        "expiry_date": "2026-12-31",
    })
    assert response.status_code == 201
    assert response.json()["quantity"] == 0.5
    assert response.json()["unit"] == "단" * 20
    assert response.json()["expiry_date"] == "2026-12-31"


async def test_partial_ingredient_update_and_explicit_expiry_clear(validation_client, inventory):
    response = await validation_client.put(f"{INGREDIENTS}/20", json={"quantity": 0.5})
    assert response.status_code == 200
    assert response.json()["quantity"] == 0.5
    assert response.json()["name"] == "우유"
    assert response.json()["unit"] == "L"
    assert response.json()["expiry_date"] == "2026-12-31"

    response = await validation_client.put(f"{INGREDIENTS}/20", json={"expiry_date": None})
    assert response.status_code == 200
    assert response.json()["expiry_date"] is None
    assert inventory.ingredient.quantity == 0.5


async def test_storage_type_only_update_preserves_name(validation_client, inventory):
    response = await validation_client.put(f"{BOXES}/10", json={"type": "FREEZER"})
    assert response.status_code == 200
    assert response.json()["type"] == "FREEZER"
    assert response.json()["name"] == "냉장실"


@pytest.mark.parametrize("path", [f"{INGREDIENTS}/20", f"{BOXES}/10"])
async def test_empty_partial_update_keeps_values(path, validation_client, inventory):
    response = await validation_client.put(path, json={})
    assert response.status_code == 200
    if path.startswith(INGREDIENTS):
        assert response.json()["name"] == "우유"
        assert response.json()["quantity"] == 2.5
        assert response.json()["unit"] == "L"
        assert response.json()["expiry_date"] == "2026-12-31"
    else:
        assert response.json()["name"] == "냉장실"
        assert response.json()["type"] == "FRIDGE"


def test_openapi_distinguishes_omitted_fields_from_nullable_values():
    schemas = app.openapi()["components"]["schemas"]
    for model, fields in [
        ("IngredientUpdate", ["name", "quantity", "unit"]),
        ("StorageBoxUpdate", ["name", "type"]),
    ]:
        for field in fields:
            definition = schemas[model]["properties"][field]
            assert {"type": "null"} not in definition.get("anyOf", [])
            assert field not in schemas[model].get("required", [])
    for model, field in [("IngredientUpdate", "expiry_date"), ("ConsumeDisposeRequest", "quantity")]:
        assert {"type": "null"} in schemas[model]["properties"][field]["anyOf"]
    assert schemas["IngredientCreate"]["properties"]["name"]["maxLength"] == 100
    assert schemas["IngredientCreate"]["properties"]["unit"]["maxLength"] == 20
    assert schemas["IngredientCreate"]["properties"]["quantity"]["exclusiveMinimum"] == 0


@pytest.mark.parametrize("action", ["consume", "dispose"])
@pytest.mark.parametrize("body", [None, {}, {"quantity": None}, {"quantity": 0.5}])
async def test_full_and_partial_actions_preserved(action, body, validation_client, inventory):
    kwargs = {} if body is None else {"json": body}
    response = await validation_client.post(f"{INGREDIENTS}/20/{action}", **kwargs)
    partial = body is not None and body.get("quantity") == 0.5
    assert response.status_code == (200 if partial else 204), response.text
    log = inventory.db.add.call_args.args[0]
    assert isinstance(log, IngredientLog)
    assert log.quantity == (0.5 if partial else 2.5)
    assert log.action_type == (ActionType.CONSUMED if action == "consume" else ActionType.DISPOSED)
    if partial:
        assert response.json()["quantity"] == 2.0
        inventory.db.delete.assert_not_awaited()
    else:
        inventory.db.delete.assert_awaited_once_with(inventory.ingredient)
