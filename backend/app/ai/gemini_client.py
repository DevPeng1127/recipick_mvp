import httpx

from app.config import settings

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"


async def call_gemini(prompt: str) -> str:
    url = f"{GEMINI_API_URL}/{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
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

    return candidates[0]["content"]["parts"][0]["text"]
