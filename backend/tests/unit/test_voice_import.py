import io
import json
import struct
import wave
from unittest.mock import AsyncMock

import pytest

from app.ai.gemini_client import GeminiRequestError
from tests.unit.test_receipt_import import receipt


def recording(seconds=0.1, *, channels=1, rate=16000, width=2, silent=False):
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(channels)
        audio.setsampwidth(width)
        audio.setframerate(rate)
        sample = b"\0" * width if silent else (struct.pack("<h", 1200) if width == 2 else b"\x20" * width)
        audio.writeframes(sample * int(rate * seconds) * channels)
    return output.getvalue()


def test_valid_wav_is_verified_and_metadata_is_not_forwarded():
    from app.services.voice_service import prepare_voice_audio
    raw = recording() + b"private trailing metadata"
    result = prepare_voice_audio(raw)
    assert b"private trailing metadata" not in result
    with wave.open(io.BytesIO(result)) as audio:
        assert audio.getnchannels() == 1
        assert audio.getsampwidth() == 2
        assert audio.getframerate() == 16000
        assert audio.getnframes() == 1600


@pytest.mark.parametrize("data", [
    b"", b"not audio", recording()[:30], recording()[:-50], recording(seconds=0),
    recording(seconds=60.01), recording(channels=2), recording(rate=48000),
    recording(width=1), recording(silent=True), b"x" * (2 * 1024 * 1024 + 1),
], ids=["empty", "invalid", "bad-header", "truncated", "zero-frames", "over-duration", "stereo", "wrong-rate", "wrong-width", "silence", "oversize"])
def test_invalid_audio_is_rejected(data):
    from app.services.voice_service import prepare_voice_audio
    with pytest.raises(ValueError):
        prepare_voice_audio(data)


def test_exactly_sixty_seconds_is_accepted():
    from app.services.voice_service import prepare_voice_audio
    assert prepare_voice_audio(recording(seconds=60))


async def test_voice_candidates_are_validated_without_inventing_missing_values(monkeypatch):
    from app.services import voice_service
    call = AsyncMock(return_value=json.dumps(receipt(quantity=None, unit=None)))
    monkeypatch.setattr(voice_service, "call_gemini_audio", call)
    result = await voice_service.preview_voice(recording(), user_id=4)
    assert result.items[0].quantity is None and result.items[0].unit is None
    assert result.items[0].needs_review is True
    assert "expiry_date" not in result.items[0].model_dump()
    assert call.call_args.kwargs["user_id"] == 4


@pytest.mark.parametrize("data", ["private audio transcript", "[]", json.dumps(receipt(quantity=-1)), json.dumps({"items": receipt()["items"] * 21, "has_more": True})])
async def test_malformed_voice_result_is_not_exposed(monkeypatch, data):
    from app.services import voice_service
    monkeypatch.setattr(voice_service, "call_gemini_audio", AsyncMock(return_value=data))
    with pytest.raises(GeminiRequestError) as error:
        await voice_service.preview_voice(recording(), user_id=4)
    assert error.value.kind == "invalid_voice"
    assert "private audio transcript" not in str(error.value)


async def test_invalid_audio_never_calls_provider(monkeypatch):
    from app.services import voice_service
    call = AsyncMock()
    monkeypatch.setattr(voice_service, "call_gemini_audio", call)
    with pytest.raises(ValueError):
        await voice_service.preview_voice(recording(silent=True), user_id=4)
    call.assert_not_awaited()
