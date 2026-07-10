from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.schemas.note import NoteUpdate, NoteOut
from app.services import note_service

router = APIRouter(tags=["notes"])


@router.get("/notes/{question_id}")
def get_note(question_id: str, db: Session = Depends(get_db)):
    note = note_service.get_note(db, question_id)
    if not note:
        return {"content": ""}
    return NoteOut.model_validate(note).model_dump()


@router.put("/notes/{question_id}")
def upsert_note(question_id: str, data: NoteUpdate, db: Session = Depends(get_db)):
    note = note_service.upsert_note(db, question_id, data.content)
    return NoteOut.model_validate(note).model_dump()


@router.delete("/notes/{question_id}", status_code=204)
def delete_note(question_id: str, db: Session = Depends(get_db)):
    if not note_service.delete_note(db, question_id):
        raise HTTPException(status_code=404, detail="笔记不存在")
    return None
