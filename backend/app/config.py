from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/recipick"

    # JWT
    JWT_SECRET_KEY: SecretStr
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # OAuth - Kakao
    KAKAO_CLIENT_ID: str = ""
    KAKAO_CLIENT_SECRET: str = ""
    KAKAO_REDIRECT_URI: str = "http://localhost:5173/oauth/kakao/callback"

    # OAuth - Google
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:5173/oauth/google/callback"

    # Gemini AI
    GEMINI_API_KEY: SecretStr = SecretStr("")
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"

    # App
    APP_ENV: str = "development"
    FRONTEND_URL: str = "http://localhost:5173"

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def validate_jwt_secret(cls, value: SecretStr) -> SecretStr:
        secret = value.get_secret_value()
        if (
            secret == "your-secret-key-change-in-production"
            or secret != secret.strip()
            or len(secret.encode("utf-8")) < 32
        ):
            raise ValueError(
                "JWT_SECRET_KEY must be a non-default secret of at least 32 bytes "
                "without surrounding whitespace. Generate one with secrets.token_urlsafe(32)."
            )
        return value

    model_config = {
        "env_file": ".env",
        "extra": "ignore",
        "hide_input_in_errors": True,
    }


settings = Settings()
