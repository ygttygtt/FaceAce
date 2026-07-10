"""Question bank routes."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.question import (
    AnswerOverrideRequest,
    BatchDeleteRequest,
    BatchMoveRequest,
    QuestionCreate,
    QuestionOut,
    QuestionUpdate,
)
from app.services import question_service
from app.services import practice_service as practice_svc

router = APIRouter(tags=["questions"])


@router.get("/questions")
def list_questions(
    db: Session = Depends(get_db),
    keyword: str | None = None,
    difficulty: str | None = None,
    qtype: str | None = None,
    tags: str | None = None,
    deck_id: str | None = None,
    bookmarked: bool | None = None,
    limit: int = Query(100, le=500),
    offset: int = 0,
):
    tag_list = [t for t in tags.split(",") if t] if tags else None
    items, total = question_service.list_questions(
        db, keyword=keyword, tags=tag_list, difficulty=difficulty, qtype=qtype,
        deck_id=deck_id, bookmarked_only=bookmarked, limit=limit, offset=offset,
    )
    annotated = question_service.annotate_questions(db, items)
    return {
        "items": [QuestionOut.model_validate(d).model_dump() for d in annotated],
        "total": total,
    }


@router.get("/questions/draw")
def draw_questions(
    db: Session = Depends(get_db),
    mode: str = "random",
    limit: int = 10,
    tags: str | None = None,
    difficulty: str | None = None,
    deck_id: str | None = None,
):
    tag_list = [t for t in tags.split(",") if t] if tags else None
    items = question_service.draw_questions(db, mode, limit, tag_list, difficulty, deck_id)
    annotated = question_service.annotate_questions(db, items)
    return {"items": [QuestionOut.model_validate(d).model_dump() for d in annotated]}


@router.get("/questions/export")
def export_questions(db: Session = Depends(get_db)):
    return {"questions": question_service.export_questions(db)}


@router.get("/questions/{qid}")
def get_question(qid: str, db: Session = Depends(get_db)):
    q = question_service.get_question(db, qid)
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    annotated = question_service.annotate_questions(db, [q])
    return QuestionOut.model_validate(annotated[0]).model_dump()


@router.post("/questions", status_code=201)
def create_question(data: QuestionCreate, db: Session = Depends(get_db)):
    q = question_service.create_question(db, data)
    return QuestionOut.model_validate(q).model_dump()


@router.put("/questions/{qid}")
def update_question(qid: str, data: QuestionUpdate, db: Session = Depends(get_db)):
    q = question_service.update_question(db, qid, data)
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    return QuestionOut.model_validate(q).model_dump()


@router.delete("/questions/{qid}", status_code=204)
def delete_question(qid: str, delete_related: bool = False, db: Session = Depends(get_db)):
    if delete_related:
        practice_svc.delete_records_by_question(db, qid)
    if not question_service.delete_question(db, qid):
        raise HTTPException(status_code=404, detail="题目不存在")
    return None


@router.post("/questions/batch-delete")
def batch_delete(req: BatchDeleteRequest, db: Session = Depends(get_db)):
    n = question_service.batch_delete(db, req.ids)
    return {"deleted": n}


@router.post("/questions/batch-move")
def batch_move(req: BatchMoveRequest, db: Session = Depends(get_db)):
    n = question_service.batch_move(db, req.ids, req.deck_id)
    return {"moved": n}


@router.put("/questions/{qid}/answer-override")
def update_answer_override(qid: str, data: AnswerOverrideRequest, db: Session = Depends(get_db)):
    q = question_service.update_answer_override(db, qid, data.answer)
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    return {"id": qid, "user_answer_override": data.answer}
