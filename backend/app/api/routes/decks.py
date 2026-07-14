"""Deck (question set) CRUD routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.deck import Deck
from app.models.question import Question
from app.schemas.deck import DeckCreate, DeckOut, DeckUpdate

router = APIRouter(tags=["decks"])


def _recount(db: Session, deck_id: str) -> None:
    d = db.get(Deck, deck_id)
    if d:
        d.question_count = db.query(Question).filter(Question.deck_id == deck_id).count()


@router.get("/decks")
def list_decks(db: Session = Depends(get_db)):
    items = db.query(Deck).order_by(Deck.created_at.desc()).all()
    # keep cached count fresh
    for d in items:
        _recount(db, d.id)
    db.commit()
    return {"items": [DeckOut.model_validate(d).model_dump() for d in items]}


@router.post("/decks", status_code=201)
def create_deck(data: DeckCreate, db: Session = Depends(get_db)):
    d = Deck(**data.model_dump())
    db.add(d)
    db.commit()
    db.refresh(d)
    return DeckOut.model_validate(d).model_dump()


@router.put("/decks/{did}")
def update_deck(did: str, data: DeckUpdate, db: Session = Depends(get_db)):
    d = db.get(Deck, did)
    if not d:
        raise HTTPException(status_code=404, detail="题库不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    db.commit()
    db.refresh(d)
    return DeckOut.model_validate(d).model_dump()


@router.delete("/decks/{did}", status_code=204)
def delete_deck(did: str, delete_questions: bool = False, db: Session = Depends(get_db)):
    d = db.get(Deck, did)
    if not d:
        raise HTTPException(status_code=404, detail="题库不存在")
    if delete_questions:
        # Delete all questions belonging to this deck
        db.query(Question).filter(Question.deck_id == did).delete()
    else:
        # Detach questions (keep them, just unassigned) rather than deleting
        db.query(Question).filter(Question.deck_id == did).update({Question.deck_id: None})
    db.delete(d)
    db.commit()
    return None
