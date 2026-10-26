import io
import json
from unittest.mock import AsyncMock

import pytest
from PIL import Image

from app.ai import gemini_client


def picture(format="PNG"):
    output = io.BytesIO()
    Image.new("RGB", (80, 120), "white").save(output, format=format)
    return output.getvalue()


def receipt(**changes):
    item = {"source_text": "우유 1L", "name": "우유 1L", "quantity": 2,
            "unit": "팩", "needs_review": False}
    return {"items": [{**item, **changes}], "has_more": False}


@pytest.mark.parametrize("format,mime", [("PNG", "image/png"), ("JPEG", "image/jpeg")])
def test_valid_image_is_decoded_and_normalized_without_metadata(format, mime):
    from app.services.receipt_service import prepare_receipt_image
    result = prepare_receipt_image(picture(format), mime)
    with Image.open(io.BytesIO(result)) as image:
        assert image.format == "JPEG"
        assert image.size == (80, 120)
        assert not image.getexif()
        image.load()


def test_phone_orientation_is_applied_and_exif_is_removed():
    from app.services.receipt_service import prepare_receipt_image
    output = io.BytesIO()
    exif = Image.Exif()
    exif[274] = 6  # Phone camera orientation: rotate 90 degrees clockwise.
    exif[270] = "private camera metadata"
    Image.new("RGB", (80, 120), "white").save(output, format="JPEG", exif=exif)
    result = prepare_receipt_image(output.getvalue(), "image/jpeg")
    assert b"private camera metadata" not in result
    with Image.open(io.BytesIO(result)) as image:
        assert image.size == (120, 80)
        assert not image.getexif()


@pytest.mark.parametrize("content,mime", [
    (b"", "image/png"), (b"not an image", "image/jpeg"),
    (picture()[:40], "image/png"), (picture(), "image/jpeg"),
    (picture(), "image/gif"), (b"x" * (5 * 1024 * 1024 + 1), "image/png"),
], ids=["empty", "not-image", "truncated", "mime-mismatch", "unsupported", "too-large"])
def test_invalid_image_is_rejected(content, mime):
    from app.services.receipt_service import prepare_receipt_image
    with pytest.raises(ValueError):
        prepare_receipt_image(content, mime)


def test_oversized_pixel_dimensions_are_rejected_before_decoding(monkeypatch):
    from app.services import receipt_service
    monkeypatch.setattr(receipt_service, "MAX_IMAGE_PIXELS", 100)
    with pytest.raises(ValueError, match="해상도"):
        receipt_service.prepare_receipt_image(picture(), "image/png")


async def test_extracts_validated_candidates_and_marks_missing_values(monkeypatch):
    from app.services import receipt_service
    call = AsyncMock(return_value=json.dumps(receipt(quantity=None, unit=None)))
    monkeypatch.setattr(receipt_service, "call_gemini_image", call)
    result = await receipt_service.preview_receipt(picture(), "image/png", user_id=7)
    assert result.items[0].quantity is None
    assert result.items[0].needs_review is True
    assert "expiry_date" not in result.items[0].model_dump()
    assert call.call_args.kwargs["user_id"] == 7
    assert call.call_args.kwargs["response_schema"]["properties"]["items"]["maxItems"] == 20


@pytest.mark.parametrize("data", [
    "private receipt raw text", "[]", json.dumps(receipt(quantity=-1)),
    json.dumps(receipt(quantity=True)), json.dumps(receipt(quantity="2")),
    json.dumps(receipt(name="")), json.dumps(receipt(unit="")),
    json.dumps(receipt(needs_review="false")),
    json.dumps({"items": receipt()["items"] * 21, "has_more": True}),
    json.dumps({**receipt(), "private": "private receipt raw text"}),
])
async def test_malformed_ai_results_are_rejected_without_exposing_content(monkeypatch, data):
    from app.services import receipt_service
    monkeypatch.setattr(receipt_service, "call_gemini_image", AsyncMock(return_value=data))
    with pytest.raises(gemini_client.GeminiRequestError) as error:
        await receipt_service.preview_receipt(picture(), "image/png", user_id=7)
    assert error.value.kind == "invalid_receipt"
    assert "private receipt raw text" not in str(error.value)


async def test_bad_image_does_not_call_ai(monkeypatch):
    from app.services import receipt_service
    call = AsyncMock()
    monkeypatch.setattr(receipt_service, "call_gemini_image", call)
    with pytest.raises(ValueError):
        await receipt_service.preview_receipt(b"bad", "image/png", user_id=7)
    call.assert_not_awaited()
