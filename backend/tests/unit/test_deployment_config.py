import secrets
import ssl

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.database.tls import database_connect_args


def production_settings(**overrides):
    values = {
        "APP_ENV": "production",
        "DATABASE_SSL": True,
        "FRONTEND_URL": "https://recipick.example.test",
        "JWT_SECRET_KEY": secrets.token_urlsafe(32),
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_production_database_requires_verified_tls():
    with pytest.raises(ValidationError, match="DATABASE_SSL=true"):
        production_settings(DATABASE_SSL=False)
    context = database_connect_args(True)["ssl"]
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True


def test_local_database_can_connect_without_tls():
    assert database_connect_args(False) == {}


def test_production_requires_https_frontend():
    with pytest.raises(ValidationError, match="HTTPS FRONTEND_URL"):
        production_settings(FRONTEND_URL="http://localhost:5173")
    assert production_settings().FRONTEND_URL == "https://recipick.example.test"
