import secrets
from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt
from pydantic import SecretStr

from app.utils import security
from app.utils.security import create_access_token, create_refresh_token, decode_token


class TestJWT:
    def test_create_and_decode_access_token(self):
        token = create_access_token(user_id=1)
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "1"
        assert payload["type"] == "access"

    def test_create_and_decode_refresh_token(self):
        token = create_refresh_token(user_id=42)
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "42"
        assert payload["type"] == "refresh"

    def test_decode_invalid_token(self):
        payload = decode_token("invalid.token.here")
        assert payload is None

    def test_decode_empty_token(self):
        payload = decode_token("")
        assert payload is None

    @pytest.mark.parametrize("token_type", ["access", "refresh"])
    def test_rejects_token_signed_with_public_default_key(self, token_type):
        token = jwt.encode(
            {
                "sub": "1",
                "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
                "type": token_type,
            },
            "your-secret-key-change-in-production",
            algorithm="HS256",
        )

        assert decode_token(token) is None

    def test_rotating_key_invalidates_existing_tokens(self, monkeypatch):
        access_token = create_access_token(1)
        refresh_token = create_refresh_token(1)
        monkeypatch.setattr(
            security.settings, "JWT_SECRET_KEY", SecretStr(secrets.token_urlsafe(32))
        )

        assert decode_token(access_token) is None
        assert decode_token(refresh_token) is None
        assert decode_token(create_access_token(1))["sub"] == "1"

    def test_oauth_state_works_with_configured_secret(self):
        assert security.verify_oauth_state(security.create_oauth_state())
