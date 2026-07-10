from sqlalchemy.orm import Session
from app.core.ids import new_id
from app.models.note import Note


def get_note(db: Session, question_id: str) -> Note | None:
    return db.query(Note).filter(Note.question_id == question_id).first()


def upsert_note(db: Session, question_id: str, content: str) -> Note:
    note = db.query(Note).filter(Note.question_id == question_id).first()
    if note:
        note.content = content
    else:
        note = Note(id=new_id(), question_id=question_id, content=content)
        db.add(note)
    db.commit()
    db.refresh(note)
    return note


def delete_note(db: Session, question_id: str) -> bool:
    note = db.query(Note).filter(Note.question_id == question_id).first()
    if not note:
        return False
    db.delete(note)
    db.commit()
    return True
