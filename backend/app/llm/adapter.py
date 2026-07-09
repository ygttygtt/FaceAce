"""OpenAI-compatible LLM adapter built on httpx (no vendor SDK).

This is the ONLY place that talks to an external LLM service. Every provider
(DeepSeek / SiliconFlow / OpenAI / 通义 / local Ollama) that speaks the
OpenAI /chat/completions protocol is handled identically here.
"""
import json
import logging
from collections.abc import AsyncGenerator
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)


@dataclass
class LLMConfig:
    base_url: str
    api_key: str
    model: str
    temperature: float = 0.7
    max_tokens: int = 2048


class LLMAdapterError(RuntimeError):
    pass


class OpenAICompatibleAdapter:
    def __init__(self, config: LLMConfig, timeout: float = 120.0):
        self.config = config
        self.timeout = timeout

    @property
    def _url(self) -> str:
        return f"{self.config.base_url.rstrip('/')}/chat/completions"

    def _headers(self) -> dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.config.api_key:
            h["Authorization"] = f"Bearer {self.config.api_key}"
        return h

    def _payload(
        self,
        messages: list[dict],
        temperature: float | None,
        max_tokens: int | None,
        stream: bool,
        response_format: dict | None,
    ) -> dict:
        payload: dict = {
            "model": self.config.model,
            "messages": messages,
            "temperature": temperature if temperature is not None else self.config.temperature,
            "max_tokens": max_tokens or self.config.max_tokens,
            "stream": stream,
        }
        if response_format:
            payload["response_format"] = response_format
        return payload

    async def chat(
        self,
        messages: list[dict],
        temperature: float | None = None,
        max_tokens: int | None = None,
        response_format: dict | None = None,
    ) -> str:
        payload = self._payload(messages, temperature, max_tokens, stream=False, response_format=response_format)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(self._url, headers=self._headers(), json=payload)
            if resp.status_code >= 400:
                raise LLMAdapterError(f"LLM API {resp.status_code}: {resp.text[:500]}")
            data = resp.json()
            try:
                return data["choices"][0]["message"]["content"] or ""
            except (KeyError, IndexError) as e:
                raise LLMAdapterError(f"Unexpected LLM response shape: {data}") from e

    async def chat_stream(
        self,
        messages: list[dict],
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncGenerator[str, None]:
        payload = self._payload(messages, temperature, max_tokens, stream=True, response_format=None)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream("POST", self._url, headers=self._headers(), json=payload) as resp:
                if resp.status_code >= 400:
                    body = await resp.aread()
                    raise LLMAdapterError(f"LLM API {resp.status_code}: {body.decode(errors='replace')[:500]}")
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
                        delta = chunk["choices"][0]["delta"].get("content")
                    except (KeyError, IndexError):
                        delta = None
                    if delta:
                        yield delta
