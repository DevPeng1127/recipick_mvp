from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class InvitationToken(BaseModel):
    token: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$", min_length=43, max_length=43)


class InvitationResponse(BaseModel):
    id: int
    created_at: datetime
    expires_at: datetime
    status: Literal["active", "expired", "revoked", "used"]


class InvitationCreated(InvitationResponse):
    url: str


class InvitationPreview(BaseModel):
    refrigerator_id: int
    refrigerator_name: str
    expires_at: datetime
    already_member: bool


class InvitationAccepted(BaseModel):
    refrigerator_id: int
    already_member: bool
