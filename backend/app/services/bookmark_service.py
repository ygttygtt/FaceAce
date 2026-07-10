from sqlalchemy.orm import Session
from app.core.ids import new_id
from app.models.bookmark import Bookmark


def toggle_bookmark(db: Session, question_id: str) -> dict:
    """Toggle bookmark on a question. Returns {bookmarked: bool, bookmark_id: str|None}."""
    existing = db.query(Bookmark).filter(Bookmark.question_id == question_id).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"bookmarked": False, "bookmark_id": None}
    bm = Bookmark(id=new_id(), question_id=question_id)
    db.add(bm)
    db.commit()
    db.refresh(bm)
    return {"bookmarked": True, "bookmark_id": bm.id}


def is_bookmarked(db: Session, question_id: str) -> bool:
    return db.query(Bookmark).filter(Bookmark.question_id == question_id).count() > 0


def list_bookmarked_question_ids(db: Session) -> list[str]:
    return [r[0] for r in db.query(Bookmark.question_id).all()]


def list_bookmarks(db: Session) -> list[Bookmark]:
    return db.query(Bookmark).order_by(Bookmark.created_at.desc()).all()
