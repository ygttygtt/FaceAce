"""Practice (flashcard) and AI grading routes."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import build_llm_service, get_db
from app.schemas.practice import (
    GradeRequest,
    GradingResultOut,
    PracticeRecordCreate,
    PracticeRecordOut,
)
from app.schemas.question import QuestionOut
from app.services import practice_service

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


@router.get("/practice/records")
def list_records(
    db: Session = Depends(get_db),
    question_id: str | None = None,
    limit: int = 50,
):
    items = practice_service.list_records(db, question_id, limit)
    return {"items": [PracticeRecordOut.model_validate(r).model_dump() for r in items]}


@router.get("/practice/wrong-questions")
def wrong_questions(db: Session = Depends(get_db)):
    items = practice_service.wrong_questions(db)
    return {"items": [QuestionOut.model_validate(q).model_dump() for q in items]}
