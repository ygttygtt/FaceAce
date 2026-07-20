import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.models.practice import GradingResult, PracticeFollowUpMessage, PracticeRecord
from app.models.question import Question
from app.schemas.llm_output import GradingResultLLM
from app.services.practice_service import grade_answer, follow_up, latest_low_score_question_ids
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


def test_low_score_retry_uses_latest_score_and_keeps_attempt_history(db):
    q1 = Question(id="low", question_text="低分题")
    q2 = Question(id="graduated", question_text="已掌握")
    now = datetime.now()
    db.add_all([
        q1,
        q2,
        GradingResult(question_id=q1.id, score=25, verdict="incorrect", created_at=now),
        GradingResult(question_id=q2.id, score=35, verdict="incorrect", created_at=now - timedelta(minutes=2)),
        GradingResult(question_id=q2.id, score=80, verdict="partially_correct", created_at=now),
    ])
    db.commit()

    assert latest_low_score_question_ids(db, 40) == [q1.id]
    # Historical low scores remain available for before/after comparison.
    assert db.query(GradingResult).filter(GradingResult.question_id == q2.id).count() == 2


def test_draw_wrong_mode_can_use_low_score_threshold(db):
    now = datetime.now()
    db.add_all([
        Question(id="score-40", question_text="四十分"),
        Question(id="score-70", question_text="七十分"),
        GradingResult(question_id="score-40", score=40, verdict="incorrect", created_at=now),
        GradingResult(question_id="score-70", score=70, verdict="partially_correct", created_at=now),
    ])
    db.commit()

    result = draw_questions(
        db, mode="wrong", group_mode=False, low_score_threshold=50
    )

    assert [q.id for q in result] == ["score-40"]


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


class _FakeLLM:
    def __init__(self):
        self.profile = SimpleNamespace(id="profile")
        self.structured_messages = None
        self.chat_messages = []

    async def structured(self, messages, schema, temperature=0.0):
        self.structured_messages = messages
        return GradingResultLLM(
            score=95,
            verdict="correct",
            strengths=["核心思路正确"],
            weaknesses=[],
            missing_points=[],
            detailed_feedback="语义等价，应认可。",
            improved_answer="示范答案",
        )

    async def chat(self, messages, temperature=None, max_tokens=None):
        self.chat_messages.append(messages)
        return "## 独立解析\n这是不依赖导入答案的分析。"


def test_grading_uses_flexible_policy_and_can_save_independent_analysis(db):
    question = Question(
        id="flexible", question_text="解释闭包", standard_answer="可能不完整的答案",
        user_answer_override="用户修订后的参考答案", answer_points=["固定措辞"],
    )
    record = PracticeRecord(
        id="attempt", question_id=question.id, user_answer="语义相同但措辞不同"
    )
    db.add_all([question, record])
    db.commit()
    llm = _FakeLLM()

    result = asyncio.run(grade_answer(
        db, llm, question.id, record.user_answer, record.id,
        include_independent_analysis=True,
    ))

    assert result.score == 95
    assert result.independent_analysis.startswith("## 独立解析")
    assert "只能作为辅助材料" in llm.structured_messages[0]["content"]
    assert "用户修订后的参考答案" in llm.structured_messages[1]["content"]
    assert "可能不完整的答案" not in llm.structured_messages[1]["content"]
    assert db.get(PracticeRecord, record.id).grading_id == result.id


def test_direct_grade_call_still_creates_a_comparable_attempt(db):
    question = Question(id="direct-grade", question_text="什么是索引？")
    db.add(question)
    db.commit()

    result = asyncio.run(grade_answer(
        db, _FakeLLM(), question.id, "索引用于加速查询"
    ))

    assert result.practice_record_id
    record = db.get(PracticeRecord, result.practice_record_id)
    assert record is not None
    assert record.user_answer == "索引用于加速查询"
    assert record.grading_id == result.id


def test_follow_up_is_saved_as_conversation_on_attempt(db):
    question = Question(id="follow-question", question_text="解释事务")
    record = PracticeRecord(
        id="follow-record", question_id=question.id, user_answer="我的回答"
    )
    grading = GradingResult(
        id="follow-grading", practice_record_id=record.id, question_id=question.id,
        score=60, verdict="partially_correct", detailed_feedback="需要补充隔离级别",
        independent_analysis="独立分析内容",
    )
    record.grading_id = grading.id
    db.add_all([question, record, grading])
    db.commit()
    llm = _FakeLLM()

    user_item, assistant_item = asyncio.run(
        follow_up(db, llm, record.id, "可以举个例子吗？")
    )

    assert user_item.role == "user"
    assert assistant_item.role == "assistant"
    assert db.query(PracticeFollowUpMessage).filter_by(
        practice_record_id=record.id
    ).count() == 2
    context = llm.chat_messages[-1][1]["content"]
    assert "需要补充隔离级别" in context
    assert "独立分析内容" in context
