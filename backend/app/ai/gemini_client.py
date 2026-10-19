import httpx

from app.config import settings

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"


async def call_gemini(prompt: str) -> str:
    url = f"{GEMINI_API_URL}/{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            # Gemini 3 recommends 1.0; leave thinking at the model default
            # (minimal for Gemini 3.5 Flash-Lite).
            "temperature": 1.0,
            "maxOutputTokens": 2048,
        },
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()

    candidates = data.get("candidates", [])
    if not candidates:
        raise ValueError("No response from Gemini API")

    candidate = candidates[0]
    if candidate.get("finishReason") != "STOP":
        raise ValueError("Gemini API did not return a complete response")

    parts = candidate.get("content", {}).get("parts", [])
    text = "".join(
        part["text"]
        for part in parts
        if isinstance(part.get("text"), str) and not part.get("thought", False)
    )
    if not text.strip():
        raise ValueError("No text response from Gemini API")

    return text
