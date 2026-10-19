import logging
import math
import traceback

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


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

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        logger.error(
            "%s %s - unhandled exception: %s\n%s",
            request.method,
            request.url.path,
            exc,
            traceback.format_exc(),
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )
