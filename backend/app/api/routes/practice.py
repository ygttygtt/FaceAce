"""Practice (flashcard) and AI grading routes."""
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import build_llm_service, get_db
from app.models.practice import GradingResult, PracticeRecord
from app.models.question import Question
from app.schemas.practice import (
    GradeRequest,
    GradingResultOut,
    PracticeRecordCreate,
    PracticeRecordDetailOut,
    PracticeRecordOut,
)
from app.schemas.question import QuestionOut
from app.services import practice_service, question_service

router = APIRouter(tags=["practice"])


@router.post("/practice/records", status_code=201)
def create_record(data: PracticeRecordCreate, db: Session = Depends(get_db)):
    pr = practice_service.record_practice(db, data)
    return PracticeRecordOut.model_validate(pr).model_dump()


@router.post("/practice/grade")
async def grade_answer(req: GradeRequest, db: Session = Depends(get_db)):
    llm = build_llm_service(db)
    g = await practice_service.grade_answer(
        db, llm, req.question_id, req.user_answer, req.practice_record_id
    )
    return GradingResultOut.model_validate(g).model_dump()


@router.post("/practice/grade/stream")
async def grade_answer_stream(req: GradeRequest, db: Session = Depends(get_db)):
    llm = build_llm_service(db)

    async def event_stream():
        async for chunk in practice_service.grade_answer_stream(
            db, llm, req.question_id, req.user_answer, req.practice_record_id
        ):
            yield f"data: {chunk}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/practice/records")
def list_records(
    db: Session = Depends(get_db),
    question_id: str | None = None,
    limit: int = 50,
):
    items = practice_service.list_records(db, question_id, limit)
    enriched = []
    for r in items:
        item = PracticeRecordOut.model_validate(r).model_dump()
        if r.grading_id:
            grading = db.get(GradingResult, r.grading_id)
            if grading:
                item["grading"] = GradingResultOut.model_validate(grading).model_dump()
        if r.question_id:
            question = db.get(Question, r.question_id)
            if question:
                item["question"] = QuestionOut.model_validate(question).model_dump()
            elif r.question_text:
                # Question deleted but snapshot exists
                item["question"] = {"question_text": r.question_text, "question_type": "", "difficulty": "", "deleted": True}
        enriched.append(item)
    return {"items": enriched}


@router.get("/practice/records/{record_id}/detail")
def get_record_detail(record_id: str, db: Session = Depends(get_db)):
    pr = db.get(PracticeRecord, record_id)
    if not pr:
        raise HTTPException(status_code=404, detail="记录不存在")
    grading = db.get(GradingResult, pr.grading_id) if pr.grading_id else None
    question = db.get(Question, pr.question_id) if pr.question_id else None
    question_data = QuestionOut.model_validate(question).model_dump() if question else None
    if not question_data and pr.question_text:
        question_data = {"question_text": pr.question_text, "question_type": "", "difficulty": "", "deleted": True}
    detail = PracticeRecordDetailOut(
        id=pr.id,
        question_id=pr.question_id,
        user_answer=pr.user_answer,
        revealed=pr.revealed,
        duration_sec=pr.duration_sec,
        grading_id=pr.grading_id,
        created_at=pr.created_at,
        grading=GradingResultOut.model_validate(grading) if grading else None,
        question=question_data,
    )
    return detail.model_dump()


@router.get("/practice/wrong-questions")
def wrong_questions(db: Session = Depends(get_db)):
    items = practice_service.wrong_questions(db)
    annotated = question_service.annotate_questions(db, items)
    return {"items": [QuestionOut.model_validate(d).model_dump() for d in annotated]}


@router.delete("/practice/records/{record_id}", status_code=204)
def delete_record(record_id: str, db: Session = Depends(get_db)):
    if not practice_service.delete_record(db, record_id):
        raise HTTPException(status_code=404, detail="记录不存在")
    return None
