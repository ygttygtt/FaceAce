"""Config schemas (LLM profiles, prompt templates, user config)."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class LLMProfileBase(BaseModel):
    name: str
    base_url: str
    api_key: str = ""
    model: str
    temperature: float = 0.7
    max_tokens: int = 2048
    is_default: bool = False
    supports_json_schema: bool = False


class LLMProfileCreate(LLMProfileBase):
    pass


class LLMProfileUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    is_default: Optional[bool] = None
    supports_json_schema: Optional[bool] = None


class LLMProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    base_url: str
    model: str
    temperature: float
    max_tokens: int
    is_default: bool
    supports_json_schema: bool
    api_key_masked: str = ""
    has_api_key: bool = False
    created_at: datetime


class PromptTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    key: str
    name: str
    content: str
    variables: list[str]


class PromptTemplateUpdate(BaseModel):
    content: Optional[str] = None
    name: Optional[str] = None


class UserConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    active_llm_profile_id: Optional[str]
    tts_enabled: bool
    tts_voice: str
    tts_rate: float
    tts_cloud_provider: Optional[str]
    srs_enabled: bool


class UserConfigUpdate(BaseModel):
    active_llm_profile_id: Optional[str] = None
    tts_enabled: Optional[bool] = None
    tts_voice: Optional[str] = None
    tts_rate: Optional[float] = None
    tts_cloud_provider: Optional[str] = None
    srs_enabled: Optional[bool] = None


class TestConnectionRequest(BaseModel):
    pass


class TestConnectionResult(BaseModel):
    ok: bool
    message: str
    reply: str = ""
