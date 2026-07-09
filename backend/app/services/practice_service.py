"""Practice (flashcard) records and AI grading service."""
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
