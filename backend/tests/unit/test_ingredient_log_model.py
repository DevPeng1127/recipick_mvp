from app.models.ingredient_log import ActionType


class TestActionType:
    def test_consumed_value(self):
        assert ActionType.CONSUMED.value == "CONSUMED"

    def test_disposed_value(self):
        assert ActionType.DISPOSED.value == "DISPOSED"

    def test_is_str_enum(self):
        assert isinstance(ActionType.CONSUMED, str)
        assert isinstance(ActionType.DISPOSED, str)

    def test_enum_members(self):
        assert set(ActionType) == {ActionType.CONSUMED, ActionType.DISPOSED}
