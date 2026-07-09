"""Prompt template rendering and DB lookup with default fallback."""
import re

from sqlalchemy.orm import Session

from app.llm.default_prompts import DEFAULT_PROMPTS
from app.models.config import PromptTemplate

_VAR_RE = re.compile(r"{{\s*(\w+)\s*}}")


def render_template(content: str, variables: dict[str, object]) -> str:
    def repl(m: re.Match[str]) -> str:
        key = m.group(1)
        val = variables.get(key, "")
        return "" if val is None else str(val)

    return _VAR_RE.sub(repl, content)


def get_prompt_content(db: Session, key: str) -> str:
    tpl = db.query(PromptTemplate).filter(PromptTemplate.key == key).first()
    if tpl:
        return tpl.content
    return DEFAULT_PROMPTS.get(key, {}).get("content", "")


def render_prompt(db: Session, key: str, variables: dict[str, object]) -> str:
    return render_template(get_prompt_content(db, key), variables)
