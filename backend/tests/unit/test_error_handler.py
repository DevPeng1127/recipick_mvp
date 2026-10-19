import logging

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.middleware.error_handler import add_error_handlers


async def test_application_error_log_omits_messages_chains_and_request_data(caplog):
    app = FastAPI()
    add_error_handlers(app)

    @app.post("/fail/{item}")
    async def fail(item: str):
        try:
            raise ValueError("private-cause fake-api-key")
        except ValueError as exc:
            raise RuntimeError("private-message fake-api-key") from exc

    caplog.set_level(logging.ERROR, logger="app.middleware.error_handler")
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test",
    ) as client:
        response = await client.post(
            "/fail/private-path?key=private-query",
            headers={"Authorization": "Bearer private-header"},
            json={"secret": "private-body"},
        )

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}
    assert "POST /fail/{item} - RuntimeError" in caplog.text
    assert "test_error_handler.py:" in caplog.text
    assert "in fail" in caplog.text
    for record in caplog.records:
        assert record.exc_info is None
        assert record.exc_text is None
        assert "private-" not in record.getMessage()
        assert "fake-api-key" not in str(record.__dict__)


async def test_error_logging_does_not_format_untrusted_exception(caplog):
    class UnprintableError(Exception):
        def __str__(self):
            raise AssertionError("Exception messages must not be formatted")

    app = FastAPI()
    add_error_handlers(app)

    @app.get("/fail")
    async def fail():
        raise UnprintableError()

    caplog.set_level(logging.ERROR, logger="app.middleware.error_handler")
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test",
    ) as client:
        response = await client.get("/fail")

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}
    assert "UnprintableError" in caplog.text
