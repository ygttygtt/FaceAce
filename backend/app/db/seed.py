"""Seed default data on first start: LLM profile from .env, prompt templates, user config."""
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.ids import new_id
from app.llm.default_prompts import DEFAULT_PROMPTS
from app.models.config import LLMProfile, PromptTemplate, UserConfig


def seed_default_data(db: Session) -> None:
    changed = False

    # 1) LLM profiles: create one from .env if DB empty and a key is configured.
    if db.query(LLMProfile).count() == 0:
        if settings.llm_api_key:
            db.add(
                LLMProfile(
                    id=new_id(),
                    name="默认",
                    base_url=settings.llm_base_url,
                    api_key=settings.llm_api_key,
                    model=settings.llm_model,
                    temperature=settings.llm_temperature,
                    max_tokens=settings.llm_max_tokens,
                    is_default=True,
                    supports_json_schema=False,
                )
            )
            changed = True
    # ensure exactly one default
    defaults = db.query(LLMProfile).filter(LLMProfile.is_default.is_(True)).all()
    if not defaults:
        first = db.query(LLMProfile).first()
        if first:
            first.is_default = True
            changed = True
    elif len(defaults) > 1:
        for d in defaults[1:]:
            d.is_default = False
        changed = True

    # 2) Prompt templates: seed all defaults if none exist.
    if db.query(PromptTemplate).count() == 0:
        for key, info in DEFAULT_PROMPTS.items():
            db.add(
                PromptTemplate(
                    id=new_id(),
                    key=key,
                    name=info["name"],
                    content=info["content"],
                    variables=info["variables"],
                )
            )
        changed = True

    # 3) User config: ensure a single row (id=1).
    if db.query(UserConfig).count() == 0:
        default_profile = (
            db.query(LLMProfile).filter(LLMProfile.is_default.is_(True)).first()
        )
        db.add(
            UserConfig(
                id=1,
                active_llm_profile_id=default_profile.id if default_profile else None,
                tts_enabled=False,
                tts_voice="",
                tts_rate=1.0,
                srs_enabled=False,
            )
        )
        changed = True

    if changed:
        db.commit()
