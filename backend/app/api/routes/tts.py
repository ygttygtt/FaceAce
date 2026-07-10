"""Cloud TTS endpoint using mimo-v2.5-tts via OpenAI-compatible chat/completions."""
import base64
import json
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.config import LLMProfile, UserConfig

logger = logging.getLogger(__name__)
router = APIRouter(tags=["tts"])


async def _stream_tts(text: str, voice: str, base_url: str, api_key: str):
    """Call mimo TTS via chat/completions with audio param, yield PCM16 bytes."""
    import httpx

    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": "mimo-v2.5-tts",
        "messages": [
            {"role": "user", "content": ""},
            {"role": "assistant", "content": text},
        ],
        "audio": {
            "format": "pcm16",
            "voice": voice or "Chloe",
        },
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                logger.error("TTS API error %d: %s", resp.status_code, body[:500])
                return
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue
                data = line[6:]
                if data.strip() == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    continue
                try:
                    choices = chunk.get("choices", [])
                    if not choices:
                        continue
                    delta = choices[0].get("delta", {})
                    audio = delta.get("audio")
                    if audio and isinstance(audio, dict) and "data" in audio:
                        pcm_bytes = base64.b64decode(audio["data"])
                        yield pcm_bytes
                except Exception as e:  # noqa: BLE001
                    logger.warning("TTS chunk parse error: %s", e)


@router.post("/tts/speak")
async def tts_speak(body: dict, db: Session = Depends(get_db)):
    """Stream PCM16 audio from mimo TTS.

    Request body: {"text": "...", "voice": "Chloe"}
    Response: application/octet-stream of PCM16LE 24kHz mono audio.
    """
    text = body.get("text", "")
    voice = body.get("voice", "Chloe")
    if not text.strip():
        return {"error": "text is required"}

    # Resolve LLM profile from user config → active profile → default
    profile = None
    uc = db.get(UserConfig, 1)
    if uc and uc.active_llm_profile_id:
        profile = db.get(LLMProfile, uc.active_llm_profile_id)
    if not profile:
        profile = db.query(LLMProfile).filter(LLMProfile.is_default.is_(True)).first()
    if not profile:
        return {"error": "未配置 LLM profile，无法使用云端 TTS"}

    async def audio_stream():
        async for pcm_chunk in _stream_tts(text, voice, profile.base_url, profile.api_key):
            yield pcm_chunk

    return StreamingResponse(audio_stream(), media_type="audio/pcm")
