"""Config routes: LLM profiles, prompt templates, user config, connection test."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_user_config
from app.llm.service import LLMService, mask_key
from app.models.config import LLMProfile, PromptTemplate
from app.schemas.config import (
    LLMProfileCreate,
    LLMProfileOut,
    LLMProfileUpdate,
    PromptTemplateOut,
    PromptTemplateUpdate,
    TestConnectionResult,
    UserConfigOut,
    UserConfigUpdate,
)

router = APIRouter(tags=["config"])


def _profile_out(p: LLMProfile) -> dict:
    return LLMProfileOut(
        id=p.id,
        name=p.name,
        base_url=p.base_url,
        model=p.model,
        temperature=p.temperature,
        max_tokens=p.max_tokens,
        is_default=p.is_default,
        supports_json_schema=p.supports_json_schema,
        api_key_masked=mask_key(p.api_key),
        has_api_key=bool(p.api_key),
        created_at=p.created_at,
    ).model_dump()


def _clear_defaults(db: Session) -> None:
    for p in db.query(LLMProfile).filter(LLMProfile.is_default.is_(True)).all():
        p.is_default = False


# ---------- LLM profiles ----------
@router.get("/config/llm-profiles")
def list_profiles(db: Session = Depends(get_db)):
    items = db.query(LLMProfile).order_by(LLMProfile.created_at).all()
    return {"items": [_profile_out(p) for p in items]}


@router.post("/config/llm-profiles", status_code=201)
def create_profile(data: LLMProfileCreate, db: Session = Depends(get_db)):
    if data.is_default:
        _clear_defaults(db)
    p = LLMProfile(**data.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return _profile_out(p)


@router.put("/config/llm-profiles/{pid}")
def update_profile(pid: str, data: LLMProfileUpdate, db: Session = Depends(get_db)):
    p = db.get(LLMProfile, pid)
    if not p:
        raise HTTPException(status_code=404, detail="profile 不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        if k == "api_key" and not v:
            continue  # don't blank an existing key on empty input
        if k == "is_default" and v:
            _clear_defaults(db)
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return _profile_out(p)


@router.delete("/config/llm-profiles/{pid}", status_code=204)
def delete_profile(pid: str, db: Session = Depends(get_db)):
    p = db.get(LLMProfile, pid)
    if not p:
        raise HTTPException(status_code=404, detail="profile 不存在")
    db.delete(p)
    db.commit()
    return None


@router.post("/config/llm-profiles/{pid}/test")
async def test_profile(pid: str, db: Session = Depends(get_db)):
    p = db.get(LLMProfile, pid)
    if not p:
        raise HTTPException(status_code=404, detail="profile 不存在")
    svc = LLMService(p)
    try:
        reply = await svc.chat([{"role": "user", "content": "请回复 ok"}], max_tokens=16)
        return TestConnectionResult(ok=True, message="连接成功", reply=reply).model_dump()
    except Exception as e:  # noqa: BLE001
        return TestConnectionResult(ok=False, message=str(e)[:300], reply="").model_dump()


# ---------- Prompt templates ----------
@router.get("/config/prompts")
def list_prompts(db: Session = Depends(get_db)):
    items = db.query(PromptTemplate).order_by(PromptTemplate.key).all()
    return {"items": [PromptTemplateOut.model_validate(p).model_dump() for p in items]}


@router.put("/config/prompts/{key}")
def update_prompt(key: str, data: PromptTemplateUpdate, db: Session = Depends(get_db)):
    p = db.query(PromptTemplate).filter(PromptTemplate.key == key).first()
    if not p:
        raise HTTPException(status_code=404, detail="prompt 模板不存在")
    if data.content is not None:
        p.content = data.content
    if data.name is not None:
        p.name = data.name
    db.commit()
    db.refresh(p)
    return PromptTemplateOut.model_validate(p).model_dump()


# ---------- User config ----------
@router.get("/config/user")
def get_user(db: Session = Depends(get_db)):
    return UserConfigOut.model_validate(get_user_config(db)).model_dump()


@router.put("/config/user")
def update_user(data: UserConfigUpdate, db: Session = Depends(get_db)):
    uc = get_user_config(db)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(uc, k, v)
    db.commit()
    db.refresh(uc)
    return UserConfigOut.model_validate(uc).model_dump()
