"""Question bank service: CRUD, draw, export."""
import random

from sqlalchemy.orm import Session

from app.models.practice import GradingResult
from app.models.question import Question
from app.schemas.question import QuestionCreate, QuestionUpdate


def list_questions(
    db: Session,
    keyword: str | None = None,
    tags: list[str] | None = None,
    difficulty: str | None = None,
    qtype: str | None = None,
    source_file: str | None = None,
    deck_id: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[Question], int]:
    q = db.query(Question).filter(Question.review_status == "approved")
    if keyword:
        q = q.filter(Question.question_text.like(f"%{keyword}%"))
    if difficulty:
        q = q.filter(Question.difficulty == difficulty)
    if qtype:
        q = q.filter(Question.question_type == qtype)
    if source_file:
        q = q.filter(Question.source_file == source_file)
    if deck_id:
        q = q.filter(Question.deck_id == deck_id)
    items = q.order_by(Question.created_at.desc()).all()
    if tags:
        items = [it for it in items if any(t in (it.tags or []) for t in tags)]
    total = len(items)
    return items[offset : offset + limit], total


def batch_delete(db: Session, ids: list[str]) -> int:
    n = db.query(Question).filter(Question.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return n


def batch_move(db: Session, ids: list[str], deck_id: str | None) -> int:
    n = (
        db.query(Question)
        .filter(Question.id.in_(ids))
        .update({Question.deck_id: deck_id}, synchronize_session=False)
    )
    db.commit()
    return n


def get_question(db: Session, question_id: str) -> Question | None:
    return db.get(Question, question_id)


def create_question(db: Session, data: QuestionCreate) -> Question:
    q = Question(**data.model_dump())
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


def update_question(db: Session, question_id: str, data: QuestionUpdate) -> Question | None:
    q = db.get(Question, question_id)
    if not q:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(q, k, v)
    db.commit()
    db.refresh(q)
    return q


def delete_question(db: Session, question_id: str) -> bool:
    q = db.get(Question, question_id)
    if not q:
        return False
    db.delete(q)
    db.commit()
    return True


def draw_questions(
    db: Session,
    mode: str = "random",
    limit: int = 10,
    tags: list[str] | None = None,
    difficulty: str | None = None,
    deck_id: str | None = None,
) -> list[Question]:
    q = db.query(Question).filter(Question.review_status == "approved")
    if difficulty:
        q = q.filter(Question.difficulty == difficulty)
    if deck_id:
        q = q.filter(Question.deck_id == deck_id)

    if mode == "wrong":
        wrong_ids = [
            r[0]
            for r in db.query(GradingResult.question_id)
            .filter(GradingResult.verdict != "correct")
            .distinct()
            .all()
        ]
        if not wrong_ids:
            return []
        items = q.filter(Question.id.in_(wrong_ids)).all()
    else:
        items = q.all()
        if tags:
            items = [it for it in items if any(t in (it.tags or []) for t in tags)]

    random.shuffle(items)
    return items[:limit]


def export_questions(db: Session) -> list[dict]:
    items = db.query(Question).filter(Question.review_status == "approved").all()
    return [
        {
            "id": it.id,
            "question_text": it.question_text,
            "question_type": it.question_type,
            "difficulty": it.difficulty,
            "tags": it.tags or [],
            "options": it.options,
            "standard_answer": it.standard_answer,
            "answer_points": it.answer_points or [],
            "explanation": it.explanation,
            "code_template": it.code_template,
            "image_placeholders": it.image_placeholders or [],
            "source": {
                "file": it.source_file,
                "page": it.source_page,
                "raw_index": it.source_raw_index,
            },
            "metadata": it.metadata_ or {},
        }
        for it in items
    ]
