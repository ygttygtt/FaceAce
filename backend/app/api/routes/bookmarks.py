from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.models.question import Question
from app.schemas.bookmark import BookmarkCreate, BookmarkOut
from app.schemas.question import QuestionOut
from app.services import bookmark_service

router = APIRouter(tags=["bookmarks"])


@router.post("/bookmarks/toggle")
def toggle_bookmark(data: BookmarkCreate, db: Session = Depends(get_db)):
    return bookmark_service.toggle_bookmark(db, data.question_id)


@router.get("/bookmarks")
def list_bookmarks(db: Session = Depends(get_db)):
    items = bookmark_service.list_bookmarks(db)
    result = []
    for b in items:
        bm = BookmarkOut.model_validate(b).model_dump()
        q = db.get(Question, b.question_id)
        bm["question"] = QuestionOut.model_validate(q).model_dump() if q else None
        result.append(bm)
    return {"items": result}


@router.get("/bookmarks/check/{question_id}")
def check_bookmark(question_id: str, db: Session = Depends(get_db)):
    return {"bookmarked": bookmark_service.is_bookmarked(db, question_id)}
