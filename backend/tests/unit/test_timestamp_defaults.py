"""The three legacy timestamp columns store UTC wall time without tzinfo."""
from datetime import datetime, timezone
from unittest.mock import Mock
import warnings

import pytest

from app.models import ingredient_log, refrigerator, user


@pytest.fixture(params=[
    (user, user.User),
    (refrigerator, refrigerator.Refrigerator),
    (ingredient_log, ingredient_log.IngredientLog),
], ids=["user", "refrigerator", "ingredient_log"])
def timestamp_model(request):
    return request.param


def test_default_generates_current_naive_utc_without_deprecation(timestamp_model):
    _, model = timestamp_model
    column = model.__table__.c.created_at
    before = datetime.now(timezone.utc).replace(tzinfo=None)
    with warnings.catch_warnings():
        warnings.simplefilter("error", DeprecationWarning)
        generated = column.default.arg(None)
    after = datetime.now(timezone.utc).replace(tzinfo=None)

    assert before <= generated <= after
    assert generated.tzinfo is None
    assert column.type.timezone is False


def test_default_reads_utc_clock_on_each_insert(timestamp_model, monkeypatch):
    module, model = timestamp_model
    instants = [
        datetime(2026, 12, 31, 14, 59, 59, 999999, tzinfo=timezone.utc),
        datetime(2026, 12, 31, 15, tzinfo=timezone.utc),
    ]
    clock = Mock(wraps=datetime)
    clock.now.side_effect = instants
    monkeypatch.setattr(module, "datetime", clock)

    for instant in instants:
        assert model.__table__.c.created_at.default.arg(None) == instant.replace(tzinfo=None)
    assert clock.now.call_count == 2
    clock.now.assert_called_with(timezone.utc)
