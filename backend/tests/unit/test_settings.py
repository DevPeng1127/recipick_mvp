import secrets

import pytest
from pydantic import SecretStr, ValidationError

from app.config import Settings


@pytest.fixture(autouse=True)
def isolate_jwt_environment(monkeypatch):
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)


@pytest.mark.parametrize("app_env", ["development", "production"])
def test_requires_explicit_jwt_secret(app_env):
    with pytest.raises(ValidationError, match="JWT_SECRET_KEY"):
        Settings(_env_file=None, APP_ENV=app_env)


@pytest.mark.parametrize("app_env", ["development", "production"])
@pytest.mark.parametrize("secret", [
    "", " " * 40, "too-short", "x" * 31,
    "your-secret-key-change-in-production",
])
def test_rejects_unsafe_jwt_secrets(app_env, secret):
    with pytest.raises(ValidationError, match="JWT_SECRET_KEY"):
        Settings(_env_file=None, APP_ENV=app_env, JWT_SECRET_KEY=secret)


def test_accepts_minimum_length_secret():
    secret = secrets.token_hex(16)  # Exactly 32 ASCII bytes, for this boundary test only.
    settings = Settings(_env_file=None, JWT_SECRET_KEY=secret)

    assert isinstance(settings.JWT_SECRET_KEY, SecretStr)
    assert settings.JWT_SECRET_KEY.get_secret_value() == secret


def test_settings_representation_hides_secret():
    secret = secrets.token_urlsafe(32)
    settings = Settings(_env_file=None, JWT_SECRET_KEY=secret)

    assert secret not in str(settings)
    assert secret not in repr(settings)
    assert secret not in settings.model_dump_json()


def test_validation_error_hides_rejected_secret():
    secret = "sensitive-but-too-short"
    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None, JWT_SECRET_KEY=secret)

    assert "JWT_SECRET_KEY" in str(error.value)
    assert secret not in str(error.value)


def test_loads_persistent_secret_from_env_file(tmp_path):
    secret = secrets.token_urlsafe(32)
    env_file = tmp_path / ".env"
    env_file.write_text(f"JWT_SECRET_KEY={secret}\n", encoding="utf-8")

    for _ in range(2):
        settings = Settings(_env_file=env_file)
        assert settings.JWT_SECRET_KEY.get_secret_value() == secret


def test_rejects_default_secret_in_env_file(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "JWT_SECRET_KEY=your-secret-key-change-in-production\n", encoding="utf-8"
    )

    with pytest.raises(ValidationError, match="JWT_SECRET_KEY"):
        Settings(_env_file=env_file)


def test_environment_secret_overrides_env_file(monkeypatch, tmp_path):
    secret = secrets.token_urlsafe(32)
    monkeypatch.setenv("JWT_SECRET_KEY", secret)
    env_file = tmp_path / ".env"
    env_file.write_text("JWT_SECRET_KEY=\n", encoding="utf-8")

    settings = Settings(_env_file=env_file)

    assert settings.JWT_SECRET_KEY.get_secret_value() == secret
