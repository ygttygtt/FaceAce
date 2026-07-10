"""Practice (flashcard) records and AI grading service."""
import json
from collections.abc import AsyncGenerator

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.llm.prompts import render_prompt
from app.llm.service import LLMService
from app.models.practice import GradingResult, PracticeRecord
from app.models.question import Question
from app.schemas.llm_output import GradingResultLLM
from app.schemas.practice import PracticeRecordCreate


def record_practice(db: Session, data: PracticeRecordCreate) -> PracticeRecord:
    pr = PracticeRecord(
        id=new_id(),
        question_id=data.question_id,
        user_answer=data.user_answer,
        revealed=data.revealed,
        duration_sec=data.duration_sec,
    )
    db.add(pr)
    db.commit()
    db.refresh(pr)
    return pr


async def grade_answer(
    db: Session,
    llm: LLMService,
    question_id: str,
    user_answer: str,
    practice_record_id: str | None = None,
) -> GradingResult:
    q = db.get(Question, question_id)
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")

    prompt = render_prompt(
        db,
        "grading_rubric",
        {
            "question_text": q.question_text,
            "question_type": q.question_type,
            "standard_answer": q.standard_answer or "(本题未提供标准答案)",
            "answer_points": "\n".join(q.answer_points or []) or "(未提供评分要点)",
            "user_answer": user_answer,
        },
    )
    result = await llm.structured(
        [{"role": "user", "content": prompt}], GradingResultLLM, temperature=0.0
    )
    if result is None:
        raise HTTPException(status_code=502, detail="AI 批改失败,请重试或检查 LLM 配置与连通性。")

    g = GradingResult(
        id=new_id(),
        practice_record_id=practice_record_id,
        question_id=question_id,
        score=result.score,
        verdict=result.verdict,
        strengths=result.strengths,
        weaknesses=result.weaknesses,
        missing_points=result.missing_points,
        detailed_feedback=result.detailed_feedback,
        improved_answer=result.improved_answer,
        llm_profile_id=llm.profile.id,
        raw_response="",
    )
    db.add(g)
    if practice_record_id:
        pr = db.get(PracticeRecord, practice_record_id)
        if pr:
            pr.grading_id = g.id
    db.commit()
    db.refresh(g)
    return g


async def grade_answer_stream(
    db: Session,
    llm: LLMService,
    question_id: str,
    user_answer: str,
    practice_record_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """Stream grading result via SSE chunks. Yields JSON-encoded SSE data lines."""
    q = db.get(Question, question_id)
    if not q:
        yield json.dumps({"error": "题目不存在", "done": True}, ensure_ascii=False)
        return

    prompt = render_prompt(
        db,
        "grading_rubric",
        {
            "question_text": q.question_text,
            "question_type": q.question_type,
            "standard_answer": q.standard_answer or "(本题未提供标准答案)",
            "answer_points": "\n".join(q.answer_points or []) or "(未提供评分要点)",
            "user_answer": user_answer,
        },
    )

    full_text = ""
    try:
        async for chunk in llm.chat_stream(
            [{"role": "user", "content": prompt}], temperature=0.0
        ):
            full_text += chunk
            yield json.dumps({"delta": chunk}, ensure_ascii=False)
    except Exception as e:
        yield json.dumps({"error": f"AI 批改失败: {e}", "done": True}, ensure_ascii=False)
        return

    from app.schemas.llm_output import GradingResultLLM as GLM
    from app.llm.service import _parse_and_validate

    result = _parse_and_validate(full_text, GLM)
    if result is None:
        yield json.dumps({"error": "AI 批改结果解析失败,请重试", "done": True}, ensure_ascii=False)
        return

    g = GradingResult(
        id=new_id(),
        practice_record_id=practice_record_id,
        question_id=question_id,
        score=result.score,
        verdict=result.verdict,
        strengths=result.strengths,
        weaknesses=result.weaknesses,
        missing_points=result.missing_points,
        detailed_feedback=result.detailed_feedback,
        improved_answer=result.improved_answer,
        llm_profile_id=llm.profile.id,
        raw_response=full_text,
    )
    db.add(g)
    if practice_record_id:
        pr = db.get(PracticeRecord, practice_record_id)
        if pr:
            pr.grading_id = g.id
    db.commit()
    db.refresh(g)

    from app.schemas.practice import GradingResultOut
    result_out = GradingResultOut.model_validate(g).model_dump(mode="json")
    yield json.dumps({"done": True, "result": result_out}, ensure_ascii=False, default=str)


def list_records(db: Session, question_id: str | None = None, limit: int = 50):
    q = db.query(PracticeRecord)
    if question_id:
        q = q.filter(PracticeRecord.question_id == question_id)
    return q.order_by(PracticeRecord.created_at.desc()).limit(limit).all()


def wrong_questions(db: Session) -> list[Question]:
    wrong_ids = [
        r[0]
        for r in db.query(GradingResult.question_id)
        .filter(GradingResult.verdict != "correct")
        .distinct()
        .all()
    ]
    if not wrong_ids:
        return []
    return db.query(Question).filter(Question.id.in_(wrong_ids)).all()
