from pydantic import BaseModel


class OAuthCallbackRequest(BaseModel):
    code: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class LoginUrlResponse(BaseModel):
    login_url: str
