from datetime import datetime, timedelta

from app.models.practice import GradingResult, PracticeRecord
from app.models.question import Question
from app.services.practice_service import latest_wrong_question_ids
from app.services.practice_service import delete_record
from app.services.question_service import draw_questions, list_tags


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


def test_draw_prefers_questions_without_practice_records(db):
    db.add_all([
        Question(id="answered", question_text="答过的题"),
        Question(id="fresh-1", question_text="新题一"),
        Question(id="fresh-2", question_text="新题二"),
        PracticeRecord(id="record-1", question_id="answered", user_answer="回答"),
    ])
    db.commit()

    result = draw_questions(db, limit=2, group_mode=False, prefer_unanswered=True)

    assert {q.id for q in result} == {"fresh-1", "fresh-2"}


def test_draw_fills_with_answered_questions_after_fresh_questions(db):
    db.add_all([
        Question(id="answered-1", question_text="答过一"),
        Question(id="answered-2", question_text="答过二"),
        Question(id="fresh", question_text="新题"),
        PracticeRecord(id="record-1", question_id="answered-1", user_answer="回答"),
        PracticeRecord(id="record-2", question_id="answered-2", user_answer="回答"),
    ])
    db.commit()

    result = draw_questions(db, limit=2, group_mode=False, prefer_unanswered=True)

    assert result[0].id == "fresh"
    assert len(result) == 2


def test_question_tags_include_counts(db):
    db.add_all([
        Question(id="tag-1", question_text="题一", tags=["JavaScript", "闭包"]),
        Question(id="tag-2", question_text="题二", tags=["JavaScript"]),
    ])
    db.commit()

    assert draw_questions(db, tags=["闭包"], group_mode=False)[0].id == "tag-1"
    assert list_tags(db) == [
        {"name": "JavaScript", "count": 2},
        {"name": "闭包", "count": 1},
    ]


def test_delete_record_removes_grading_linked_by_record_id(db):
    question = Question(id="cancel-question", question_text="取消批改")
    record = PracticeRecord(id="cancel-record", question_id=question.id, user_answer="回答")
    grading = GradingResult(
        id="cancel-grading",
        question_id=question.id,
        practice_record_id=record.id,
        verdict="correct",
    )
    db.add_all([question, record, grading])
    db.commit()

    assert delete_record(db, record.id) is True
    assert db.get(PracticeRecord, record.id) is None
    assert db.get(GradingResult, grading.id) is None
