"""LLM normalization of a text chunk into structured questions."""
from sqlalchemy.orm import Session

from app.llm.prompts import render_prompt
from app.llm.service import LLMService
from app.schemas.llm_output import NormalizedQuestion, NormalizedQuestions


async def normalize_chunk(
    db: Session, llm: LLMService, chunk_text: str
) -> list[NormalizedQuestion]:
    prompt = render_prompt(db, "normalize_questions", {"raw_chunk": chunk_text})
    messages = [{"role": "user", "content": prompt}]
    result = await llm.structured(messages, NormalizedQuestions, temperature=0.0)
    if result is None:
        return []
    return result.questions
