from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.schemas.bookmark import BookmarkCreate, BookmarkOut
from app.services import bookmark_service

router = APIRouter(tags=["bookmarks"])


@router.post("/bookmarks/toggle")
def toggle_bookmark(data: BookmarkCreate, db: Session = Depends(get_db)):
    return bookmark_service.toggle_bookmark(db, data.question_id)


@router.get("/bookmarks")
def list_bookmarks(db: Session = Depends(get_db)):
    items = bookmark_service.list_bookmarks(db)
    return {"items": [BookmarkOut.model_validate(b).model_dump() for b in items]}


@router.get("/bookmarks/check/{question_id}")
def check_bookmark(question_id: str, db: Session = Depends(get_db)):
    return {"bookmarked": bookmark_service.is_bookmarked(db, question_id)}
