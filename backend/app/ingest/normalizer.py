"""LLM normalization with boundary-aware count enforcement."""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.llm.prompts import render_prompt
from app.llm.service import LLMService
from app.schemas.llm_output import NormalizedQuestion, NormalizedQuestions


async def normalize_chunk(
    db: Session,
    llm: LLMService,
    chunk_text: str,
    *,
    expected_count: int | None = None,
    boundary_type: str = "semantic_window",
    question_heading: str | None = None,
) -> list[NormalizedQuestion]:
    prompt = render_prompt(db, "normalize_questions", {"raw_chunk": chunk_text})
    if expected_count == 1:
        prompt += _single_question_constraint(question_heading, boundary_type)
    messages = [{"role": "user", "content": prompt}]
    result = await llm.structured(messages, NormalizedQuestions, temperature=0.0)
    if result is None:
        return []
    questions = result.questions
    if expected_count == 1 and len(questions) != 1:
        # One corrective pass gives capable models a chance to honor the source
        # boundary. A deterministic collapse below protects smaller models.
        correction = prompt + f"""

【格式纠错】你刚才返回了 {len(questions)} 题，但本段原文边界明确且必须只返回 1 题。
请把同标题下的多个问句保留为一个复合题；答案中的编号、步骤、反问和小标题全部并回该题，不能升级为新题。
"""
        retried = await llm.structured(
            [{"role": "user", "content": correction}], NormalizedQuestions, temperature=0.0
        )
        if retried is not None:
            questions = retried.questions
    if expected_count == 1 and len(questions) > 1:
        questions = [_collapse_to_one(questions, question_heading)]
    elif expected_count == 1 and len(questions) == 1 and question_heading:
        questions[0].question_text = _clean_heading(question_heading) or questions[0].question_text
    return questions


def _single_question_constraint(heading: str | None, boundary_type: str) -> str:
    return f"""

【本分段的边界约束（优先级高于通用拆题规则）】
- 边界类型：{boundary_type}
- 已确认主问题标题：{heading or '由当前原文块确定'}
- 期望题数：严格等于 1。
- 同一标题中的多个问句属于一道复合题，不得拆开。
- “答案/解析/追问/步骤/降级策略”等内部小标题和编号列表属于该题内容，不得生成新题。
- 不允许从答案中的示例问题、反问句或扩展知识点创造题目。
"""


def _collapse_to_one(
    questions: list[NormalizedQuestion], heading: str | None
) -> NormalizedQuestion:
    primary = questions[0].model_copy(deep=True)
    if heading:
        primary.question_text = _clean_heading(heading) or primary.question_text
    else:
        unique_texts = list(dict.fromkeys(q.question_text.strip() for q in questions if q.question_text.strip()))
        primary.question_text = "；".join(unique_texts)
    primary.tags = list(dict.fromkeys(tag for q in questions for tag in q.tags))[:5]
    primary.answer_points = list(dict.fromkeys(point for q in questions for point in q.answer_points))
    primary.standard_answer = _join_unique(q.standard_answer for q in questions)
    primary.explanation = _join_unique(q.explanation for q in questions)
    primary.options = primary.options or next((q.options for q in questions if q.options), None)
    primary.group_id = None
    primary.group_seq = None
    primary.group_label = None
    return primary


def _clean_heading(value: str) -> str:
    value = re.sub(
        r"^(?:题\s*\d+|Q\s*\d+|第\s*[一二三四五六七八九十百\d]+\s*题)\s*[｜|:：.、)）\-]*\s*",
        "",
        value.strip(),
        flags=re.IGNORECASE,
    )
    value = re.sub(r"^(?:\d+\s*[.、)）]|\(\d+\))\s*", "", value)
    return value.strip()


def _join_unique(values) -> str | None:
    result = list(dict.fromkeys(value.strip() for value in values if value and value.strip()))
    return "\n\n".join(result) if result else None
