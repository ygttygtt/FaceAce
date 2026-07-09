"""Shared FastAPI dependencies and LLM service construction."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db  # re-exported for routes
from app.llm.service import LLMService
from app.models.config import LLMProfile, UserConfig


def resolve_llm_profile(db: Session, profile_id: str | None = None) -> LLMProfile:
    """Resolve which LLM profile to use: explicit id > user-config active > is_default > first."""
    if profile_id:
        p = db.get(LLMProfile, profile_id)
        if not p:
            raise HTTPException(status_code=404, detail="LLM profile not found")
        return p

    uc = db.query(UserConfig).first()
    if uc and uc.active_llm_profile_id:
        p = db.get(LLMProfile, uc.active_llm_profile_id)
        if p:
            return p

    p = db.query(LLMProfile).filter(LLMProfile.is_default.is_(True)).first()
    if p:
        return p

    p = db.query(LLMProfile).first()
    if p:
        return p

    raise HTTPException(status_code=400, detail="尚未配置 LLM,请先在设置页添加一个 LLM profile。")


def build_llm_service(db: Session, profile_id: str | None = None) -> LLMService:
    return LLMService(resolve_llm_profile(db, profile_id))


def get_user_config(db: Session) -> UserConfig:
    uc = db.query(UserConfig).first()
    if not uc:
        uc = UserConfig(id=1)
        db.add(uc)
        db.commit()
        db.refresh(uc)
    return uc
