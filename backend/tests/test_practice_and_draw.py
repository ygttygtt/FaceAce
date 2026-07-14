from datetime import datetime, timedelta

from app.models.practice import GradingResult
from app.models.question import Question
from app.services.practice_service import latest_wrong_question_ids
from app.services.question_service import draw_questions


def _grading(question_id: str, verdict: str, created_at: datetime) -> GradingResult:
    return GradingResult(
        question_id=question_id,
        verdict=verdict,
        score=90 if verdict == "correct" else 60,
        created_at=created_at,
    )


def test_wrong_question_graduates_when_latest_attempt_is_correct(db):
    q = Question(id="q1", question_text="闭包是什么？")
    db.add(q)
    now = datetime.now()
    db.add_all([
        _grading(q.id, "incorrect", now - timedelta(minutes=2)),
        _grading(q.id, "correct", now - timedelta(minutes=1)),
    ])
    db.commit()

    assert latest_wrong_question_ids(db) == []


def test_wrong_question_uses_latest_attempt(db):
    q = Question(id="q2", question_text="解释事务隔离级别")
    db.add(q)
    now = datetime.now()
    db.add_all([
        _grading(q.id, "correct", now - timedelta(minutes=2)),
        _grading(q.id, "partially_correct", now - timedelta(minutes=1)),
    ])
    db.commit()

    assert latest_wrong_question_ids(db) == [q.id]


def test_group_mode_can_be_disabled(db):
    db.add_all([
        Question(id="g1", question_text="基础题", group_id="chain", group_seq=1),
        Question(id="g2", question_text="追问题", group_id="chain", group_seq=2),
    ])
    db.commit()

    grouped = draw_questions(db, limit=1, group_mode=True)
    singles = draw_questions(db, limit=1, group_mode=False)

    assert [q.id for q in grouped] == ["g1", "g2"]
    assert len(singles) == 1
