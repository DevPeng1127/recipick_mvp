import logging
import math
import traceback
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.ai.gemini_client import GeminiRequestError

logger = logging.getLogger(__name__)


def log_server_error(request: Request, exc: Exception) -> None:
    # Exception messages/chains, source lines and locals can contain credentials.
    # Keep only diagnostic metadata; route templates exclude user-supplied paths.
    route = getattr(request.scope.get("route"), "path", "<unmatched>")
    frames = " -> ".join(
        f"{Path(frame.f_code.co_filename).name}:{line} in {frame.f_code.co_name}"
        for frame, line in traceback.walk_tb(exc.__traceback__)
    )
    provider = (
        f" kind={exc.kind} provider_status={exc.status_code}"
        if isinstance(exc, GeminiRequestError) else ""
    )
    logger.error(
        "%s %s - %s%s; frames=%s",
        request.method, route, type(exc).__name__, provider, frames,
    )


def add_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def request_validation_error_handler(request: Request, exc: RequestValidationError):
        # Rejected NaN/Infinity (including JSON number overflow) may appear in
        # error inputs. Encode them as text so the 422 response is valid JSON.
        errors = jsonable_encoder(
            exc.errors(),
            custom_encoder={float: lambda value: value if math.isfinite(value) else str(value)},
        )
        return JSONResponse(status_code=422, content={"detail": errors})

    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        return JSONResponse(
            status_code=400,
            content={"detail": str(exc)},
        )

    # A specific handler also prevents ServerErrorMiddleware from re-raising
    # provider failures into Uvicorn's separate raw exception logger.
    @app.exception_handler(GeminiRequestError)
    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        log_server_error(request, exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )
