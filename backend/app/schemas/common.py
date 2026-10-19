from typing import Annotated

from pydantic import BaseModel, StringConstraints


# Refrigerator, storage box and ingredient names share a VARCHAR(100) limit.
ResourceName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]


class MessageResponse(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    detail: str
