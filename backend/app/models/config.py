"""LLM profiles, prompt templates, and user config models."""
from sqlalchemy import Boolean, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.ids import new_id
from app.db.base import Base, TimestampMixin


class LLMProfile(Base, TimestampMixin):
    __tablename__ = "llm_profiles"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(64))
    base_url: Mapped[str] = mapped_column(String(255))
    api_key: Mapped[str] = mapped_column(String(255), default="")
    model: Mapped[str] = mapped_column(String(128))
    temperature: Mapped[float] = mapped_column(Float, default=0.7)
    max_tokens: Mapped[int] = mapped_column(Integer, default=2048)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    supports_json_schema: Mapped[bool] = mapped_column(Boolean, default=False)


class PromptTemplate(Base, TimestampMixin):
    __tablename__ = "prompt_templates"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    content: Mapped[str] = mapped_column(Text)
    variables: Mapped[list] = mapped_column(JSON, default=list)


class UserConfig(Base, TimestampMixin):
    __tablename__ = "user_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    active_llm_profile_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tts_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    tts_voice: Mapped[str] = mapped_column(String(128), default="")
    tts_rate: Mapped[float] = mapped_column(Float, default=1.0)
    tts_cloud_provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    srs_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
