"""High-level LLM service: chat, streaming, and structured (JSON) output.

Structured output uses a three-tier fallback across providers:
  1. response_format = json_schema  (if profile.supports_json_schema)
  2. response_format = json_object  (most OpenAI-compatible endpoints)
  3. plain text + regex extraction  (last resort)
Each tier is validated with Pydantic; on failure the error is fed back once.
"""
import json
import logging
import re
from collections.abc import AsyncGenerator
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.llm.adapter import LLMAdapterError, LLMConfig, OpenAICompatibleAdapter
from app.models.config import LLMProfile

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*", re.IGNORECASE)


def mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return key[:2] + "***"
    return key[:4] + "..." + key[-4:]


class LLMService:
    def __init__(self, profile: LLMProfile):
        self.profile = profile
        self.adapter = OpenAICompatibleAdapter(
            LLMConfig(
                base_url=profile.base_url,
                api_key=profile.api_key,
                model=profile.model,
                temperature=profile.temperature,
                max_tokens=profile.max_tokens,
            )
        )

    # ---- plain chat ----
    async def chat(
        self,
        messages: list[dict],
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str:
        return await self.adapter.chat(messages, temperature, max_tokens)

    async def chat_stream(
        self,
        messages: list[dict],
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncGenerator[str, None]:
        async for chunk in self.adapter.chat_stream(messages, temperature, max_tokens):
            yield chunk

    # ---- structured (JSON) ----
    async def structured(
        self,
        messages: list[dict],
        schema_model: type[T],
        temperature: float = 0.0,
        max_retries: int = 1,
    ) -> T | None:
        response_format = self._build_response_format(schema_model)
        attempt_messages = list(messages)

        for attempt in range(max_retries + 1):
            content: str | None = None
            try:
                content = await self.adapter.chat(
                    attempt_messages,
                    temperature=temperature,
                    response_format=response_format,
                )
            except LLMAdapterError as e:
                logger.warning("LLM structured call failed (attempt %d): %s", attempt, e)
                response_format = self._downgrade(response_format)
                if response_format is None and attempt >= max_retries:
                    return None
                continue

            parsed = _parse_and_validate(content, schema_model)
            if parsed is not None:
                return parsed

            logger.warning("LLM structured validation failed (attempt %d). raw head: %s", attempt, (content or "")[:300])
            if attempt < max_retries:
                attempt_messages = attempt_messages + [
                    {"role": "assistant", "content": content or ""},
                    {
                        "role": "user",
                        "content": "你上一次输出无法通过 JSON 校验。请只输出严格符合要求的合法 JSON,不要 markdown 代码块、不要任何额外文字。",
                    },
                ]
                response_format = self._downgrade(response_format)
        return None

    def _build_response_format(self, schema_model: type[BaseModel]) -> dict:
        if self.profile.supports_json_schema:
            try:
                schema = schema_model.model_json_schema()
                return {
                    "type": "json_schema",
                    "json_schema": {
                        "name": schema_model.__name__,
                        "schema": schema,
                        "strict": False,
                    },
                }
            except Exception:
                logger.warning("Failed to build json_schema for %s, using json_object", schema_model.__name__)
        return {"type": "json_object"}

    @staticmethod
    def _downgrade(response_format: dict | None) -> dict | None:
        if response_format is None:
            return None
        fmt = response_format.get("type")
        if fmt == "json_schema":
            return {"type": "json_object"}
        if fmt == "json_object":
            return None
        return None


def _strip_code_fence(text: str) -> str:
    """Remove a leading ```json / ``` fence and trailing ``` if present."""
    t = text.strip()
    if t.startswith("```"):
        # drop the first fence line
        t = t.split("\n", 1)[1] if "\n" in t else t
        if t.endswith("```"):
            t = t.rsplit("```", 1)[0]
        t = t.strip()
    return t


def _extract_json(text: str) -> object | None:
    """Best-effort extraction of the first JSON object/array from text."""
    t = _strip_code_fence(text)
    # try direct
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        pass
    # find first { ... } or [ ... ] using a bracket scanner
    for opener, closer in (("{", "}"), ("[", "]")):
        start = t.find(opener)
        if start == -1:
            continue
        depth = 0
        in_str = False
        escape = False
        for i in range(start, len(t)):
            ch = t[i]
            if in_str:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == opener:
                depth += 1
            elif ch == closer:
                depth -= 1
                if depth == 0:
                    candidate = t[start : i + 1]
                    try:
                        return json.loads(candidate)
                    except json.JSONDecodeError:
                        break
    return None


def _parse_and_validate(content: str | None, schema_model: type[T]) -> T | None:
    if not content:
        return None
    data = _extract_json(content)
    if data is None:
        return None
    try:
        return schema_model.model_validate(data)
    except ValidationError:
        return None
