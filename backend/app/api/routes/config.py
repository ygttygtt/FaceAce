"""Config routes: LLM profiles, prompt templates, user config, connection test."""
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_user_config
from app.llm.service import LLMService, mask_key
from app.models.config import LLMProfile, PromptTemplate, UserConfig
from app.schemas.config import (
    LLMProfileCreate,
    LLMModelDiscoverRequest,
    LLMModelDiscoverResult,
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


def _activate_profile(db: Session, profile_id: str) -> None:
    """Keep the user-selected active profile aligned with a new default."""
    uc = db.query(UserConfig).first()
    if not uc:
        uc = UserConfig(id=1)
        db.add(uc)
    uc.active_llm_profile_id = profile_id


def _model_ids(payload: object) -> list[str]:
    if not isinstance(payload, dict):
        return []
    items = payload.get("data") or payload.get("models") or []
    if isinstance(items, dict):
        items = items.get("data") or items.get("items") or []
    if not isinstance(items, list):
        return []
    ids: list[str] = []
    for item in items:
        if isinstance(item, str):
            model_id = item
        elif isinstance(item, dict):
            model_id = item.get("id") or item.get("model") or item.get("name")
        else:
            model_id = None
        if isinstance(model_id, str) and model_id.strip():
            ids.append(model_id.strip())
    return sorted(set(ids), key=str.casefold)


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
    db.flush()
    if data.is_default:
        _activate_profile(db, p.id)
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
    if data.is_default:
        _activate_profile(db, p.id)
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


@router.post("/config/llm-models/discover")
async def discover_llm_models(data: LLMModelDiscoverRequest, db: Session = Depends(get_db)):
    base_url = data.base_url.strip()
    api_key = data.api_key.strip()
    if data.profile_id:
        profile = db.get(LLMProfile, data.profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail="profile 不存在")
        base_url = base_url or profile.base_url
        api_key = api_key or profile.api_key

    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return LLMModelDiscoverResult(ok=False, message="Base URL 格式无效", models=[]).model_dump()

    url = f"{base_url.rstrip('/')}/models"
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(url, headers=headers)
        if response.status_code >= 400:
            detail = response.text[:240].strip()
            return LLMModelDiscoverResult(
                ok=False,
                message=f"模型接口返回 HTTP {response.status_code}{': ' + detail if detail else ''}",
                models=[],
            ).model_dump()
        models = _model_ids(response.json())
        if not models:
            return LLMModelDiscoverResult(
                ok=False,
                message="接口可访问，但没有解析到模型列表",
                models=[],
            ).model_dump()
        return LLMModelDiscoverResult(
            ok=True,
            message=f"已获取 {len(models)} 个可用模型",
            models=models,
        ).model_dump()
    except Exception as e:  # noqa: BLE001
        return LLMModelDiscoverResult(
            ok=False,
            message=f"无法访问模型接口：{str(e)[:240]}",
            models=[],
        ).model_dump()


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
