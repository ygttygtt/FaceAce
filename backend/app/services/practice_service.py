"""Practice (flashcard) records and AI grading service."""
import json
import logging
from collections.abc import AsyncGenerator
from datetime import datetime

from fastapi import HTTPException

logger = logging.getLogger(__name__)
from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.llm.prompts import render_prompt
from app.llm.adapter import LLMAdapterError
from app.llm.service import LLMService, _parse_and_validate
from app.models.practice import GradingResult, PracticeFollowUpMessage, PracticeRecord
from app.models.question import Question
from app.schemas.llm_output import GradingResultLLM
from app.schemas.practice import GradingResultOut, PracticeRecordCreate


_GRADING_POLICY = """以下规则优先于用户模板中可能存在的更严格旧规则：
随题导入的标准答案和评分点可能不完整、过时或有误，只能作为辅助材料。请先凭专业知识判断答案；接受语义等价、不同术语和其他正确解法，不要求逐条复述固定评分点。只有实质性知识错误或核心遗漏才扣分。优秀且没有实质缺陷的回答可以得到满分；如果参考材料有疑点，在反馈中说明。"""


def record_practice(db: Session, data: PracticeRecordCreate) -> PracticeRecord:
    # Snapshot question_text so history is self-contained even if question is deleted
    q = db.get(Question, data.question_id)
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    pr = PracticeRecord(
        id=new_id(),
        question_id=data.question_id,
        question_text=q.question_text if q else None,
        user_answer=data.user_answer,
        revealed=data.revealed,
        duration_sec=data.duration_sec,
        created_at=datetime.now(),
    )
    db.add(pr)
    db.commit()
    db.refresh(pr)
    return pr


async def grade_answer(
    db: Session,
    llm: LLMService,
    question_id: str,
    user_answer: str,
    practice_record_id: str | None = None,
    include_independent_analysis: bool = False,
) -> GradingResult:
    q, messages = _grading_context(db, question_id, user_answer, practice_record_id)
    result = await llm.structured(
        messages, GradingResultLLM, temperature=0.0
    )
    if result is None:
        raise HTTPException(status_code=502, detail="AI 批改失败,请重试或检查 LLM 配置与连通性。")
    independent_analysis = None
    if include_independent_analysis:
        try:
            independent_analysis = await _generate_independent_analysis(db, llm, q, user_answer)
        except HTTPException as exc:
            # An optional second opinion should not throw away the primary grade.
            logger.warning("Independent analysis failed after grading: %s", exc.detail)
    return _save_grading(
        db, llm, q, user_answer, result, practice_record_id,
        raw_response="", independent_analysis=independent_analysis,
    )


async def grade_answer_stream(
    db: Session,
    llm: LLMService,
    question_id: str,
    user_answer: str,
    practice_record_id: str | None = None,
    include_independent_analysis: bool = False,
) -> AsyncGenerator[str, None]:
    """Stream grading result via SSE chunks. Yields JSON-encoded SSE data lines."""
    try:
        q, messages = _grading_context(db, question_id, user_answer, practice_record_id)
    except HTTPException as exc:
        yield json.dumps({"error": exc.detail, "done": True}, ensure_ascii=False)
        return

    full_text = ""
    try:
        async for chunk in llm.chat_stream(
            messages, temperature=0.0
        ):
            full_text += chunk
            yield json.dumps({"delta": chunk}, ensure_ascii=False)
    except (LLMAdapterError, ConnectionError) as e:
        yield json.dumps({"error": f"AI 批改失败: {e}", "done": True}, ensure_ascii=False)
        return

    result = _parse_and_validate(full_text, GradingResultLLM)
    if result is None:
        # Fallback: re-call with structured output (json_schema → json_object degradation + retry)
        logger.warning("Stream grade parse failed, falling back to structured(). raw head: %s", full_text[:300])
        result = await llm.structured(
            messages, GradingResultLLM, temperature=0.0
        )
        if result is None:
            yield json.dumps({"error": "AI 批改结果解析失败,请重试", "done": True}, ensure_ascii=False)
            return

    independent_analysis = None
    if include_independent_analysis:
        yield json.dumps({"phase": "independent_analysis"}, ensure_ascii=False)
        independent_chunks: list[str] = []
        try:
            independent_prompt = _independent_analysis_prompt(db, q, user_answer)
            async for chunk in llm.chat_stream(
                [{"role": "user", "content": independent_prompt}], temperature=0.2
            ):
                independent_chunks.append(chunk)
                yield json.dumps({"analysis_delta": chunk}, ensure_ascii=False)
            independent_analysis = "".join(independent_chunks).strip() or None
        except (LLMAdapterError, ConnectionError) as exc:
            # The optional second opinion must not discard an otherwise valid grade.
            logger.warning("Independent analysis failed after grading: %s", exc)
            yield json.dumps(
                {"analysis_error": f"独立解析生成失败: {exc}"}, ensure_ascii=False
            )

    g = _save_grading(
        db, llm, q, user_answer, result, practice_record_id,
        raw_response=full_text, independent_analysis=independent_analysis,
    )

    result_out = GradingResultOut.model_validate(g).model_dump(mode="json")
    yield json.dumps({"done": True, "result": result_out}, ensure_ascii=False, default=str)


def _grading_context(
    db: Session,
    question_id: str,
    user_answer: str,
    practice_record_id: str | None,
) -> tuple[Question, list[dict]]:
    q = db.get(Question, question_id)
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    if practice_record_id:
        record = db.get(PracticeRecord, practice_record_id)
        if not record:
            raise HTTPException(status_code=404, detail="作答记录不存在")
        if record.question_id != question_id:
            raise HTTPException(status_code=400, detail="作答记录与题目不匹配")
        # Preserve exactly what was submitted even if a client sent a stale copy.
        if record.user_answer and record.user_answer.strip() != user_answer.strip():
            raise HTTPException(status_code=409, detail="提交答案与已保存的作答记录不一致")

    prompt = render_prompt(
        db,
        "grading_rubric",
        {
            "question_text": q.question_text,
            "question_type": q.question_type,
            "standard_answer": (
                q.user_answer_override
                or q.standard_answer
                or "(本题未提供标准答案)"
            ),
            "answer_points": "\n".join(q.answer_points or []) or "(未提供评分要点)",
            "user_answer": user_answer,
        },
    )
    return q, [
        {"role": "system", "content": _GRADING_POLICY},
        {"role": "user", "content": prompt},
    ]


def _independent_analysis_prompt(db: Session, q: Question, user_answer: str) -> str:
    return render_prompt(
        db,
        "independent_practice_analysis",
        {
            "question_text": q.question_text,
            "question_type": q.question_type,
            "user_answer": user_answer,
        },
    )


async def _generate_independent_analysis(
    db: Session, llm: LLMService, q: Question, user_answer: str
) -> str:
    try:
        result = await llm.chat(
            [{"role": "user", "content": _independent_analysis_prompt(db, q, user_answer)}],
            temperature=0.2,
        )
    except (LLMAdapterError, ConnectionError) as exc:
        raise HTTPException(status_code=502, detail=f"独立解析生成失败: {exc}") from exc
    if not result.strip():
        raise HTTPException(status_code=502, detail="独立解析生成失败：模型返回了空内容")
    return result.strip()


def _save_grading(
    db: Session,
    llm: LLMService,
    q: Question,
    user_answer: str,
    result: GradingResultLLM,
    practice_record_id: str | None,
    *,
    raw_response: str,
    independent_analysis: str | None,
) -> GradingResult:
    # The record ID is optional for backward compatibility. Direct API users
    # still get a durable attempt so repeated answers are always comparable.
    record: PracticeRecord | None = None
    if not practice_record_id:
        record = PracticeRecord(
            id=new_id(), question_id=q.id, question_text=q.question_text,
            user_answer=user_answer, revealed=False, duration_sec=0,
            created_at=datetime.now(),
        )
        db.add(record)
        practice_record_id = record.id
    g = GradingResult(
        id=new_id(), practice_record_id=practice_record_id, question_id=q.id,
        score=result.score, verdict=result.verdict, strengths=result.strengths,
        weaknesses=result.weaknesses, missing_points=result.missing_points,
        detailed_feedback=result.detailed_feedback, improved_answer=result.improved_answer,
        independent_analysis=independent_analysis, llm_profile_id=llm.profile.id,
        raw_response=raw_response, created_at=datetime.now(),
    )
    db.add(g)
    if practice_record_id:
        record = record or db.get(PracticeRecord, practice_record_id)
        if record:
            record.grading_id = g.id
            # Backfill old/client-created empty answers without mutating a prior answer.
            if not record.user_answer:
                record.user_answer = user_answer
    db.commit()
    db.refresh(g)
    return g


def list_records(db: Session, question_id: str | None = None, limit: int = 50):
    q = db.query(PracticeRecord)
    if question_id:
        q = q.filter(PracticeRecord.question_id == question_id)
    return q.order_by(PracticeRecord.created_at.desc(), PracticeRecord.id.desc()).limit(limit).all()


def list_follow_ups(db: Session, record_id: str) -> list[PracticeFollowUpMessage]:
    record = db.get(PracticeRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="作答记录不存在")
    return (
        db.query(PracticeFollowUpMessage)
        .filter(PracticeFollowUpMessage.practice_record_id == record_id)
        .order_by(PracticeFollowUpMessage.created_at, PracticeFollowUpMessage.id)
        .all()
    )


async def follow_up(
    db: Session, llm: LLMService, record_id: str, message: str
) -> tuple[PracticeFollowUpMessage, PracticeFollowUpMessage]:
    record = db.get(PracticeRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="作答记录不存在")
    grading = db.get(GradingResult, record.grading_id) if record.grading_id else None
    if not grading:
        raise HTTPException(status_code=409, detail="这条作答尚未完成 AI 批改，无法追问")
    question = db.get(Question, record.question_id)
    question_text = question.question_text if question else (record.question_text or "(题目已删除)")

    system_prompt = render_prompt(db, "practice_follow_up", {})
    context = (
        f"【题目】\n{question_text}\n\n"
        f"【用户当时的回答】\n{record.user_answer or '(未填写)'}\n\n"
        f"【基于参考材料的批改】\n分数：{grading.score}\n{grading.detailed_feedback}\n\n"
        f"【独立解析】\n{grading.independent_analysis or '(本次未生成)'}"
    )
    history = list_follow_ups(db, record_id)[-20:]
    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "system", "content": context},
    ]
    messages.extend({"role": item.role, "content": item.content} for item in history)
    messages.append({"role": "user", "content": message.strip()})
    try:
        reply = await llm.chat(messages, temperature=0.2)
    except (LLMAdapterError, ConnectionError) as exc:
        raise HTTPException(status_code=502, detail=f"AI 追问失败: {exc}") from exc
    if not reply.strip():
        raise HTTPException(status_code=502, detail="AI 追问失败：模型返回了空内容")

    user_item = PracticeFollowUpMessage(
        id=new_id(), practice_record_id=record_id, grading_result_id=grading.id,
        role="user", content=message.strip(), created_at=datetime.now(),
    )
    assistant_item = PracticeFollowUpMessage(
        id=new_id(), practice_record_id=record_id, grading_result_id=grading.id,
        role="assistant", content=reply.strip(), created_at=datetime.now(),
    )
    db.add_all([user_item, assistant_item])
    db.commit()
    db.refresh(user_item)
    db.refresh(assistant_item)
    return user_item, assistant_item


def delete_record(db: Session, record_id: str) -> bool:
    pr = db.get(PracticeRecord, record_id)
    if not pr:
        return False
    gradings = db.query(GradingResult).filter(
        (GradingResult.practice_record_id == record_id)
        | (GradingResult.id == pr.grading_id)
    ).all()
    for grading in gradings:
        _delete_grading(db, grading)
    db.query(PracticeFollowUpMessage).filter(
        PracticeFollowUpMessage.practice_record_id == record_id
    ).delete(synchronize_session=False)
    db.delete(pr)
    db.commit()
    return True


def delete_records_by_question(db: Session, question_id: str) -> int:
    """Delete all practice records (and their grading results) for a question."""
    records = db.query(PracticeRecord).filter(PracticeRecord.question_id == question_id).all()
    count = 0
    for pr in records:
        db.query(PracticeFollowUpMessage).filter(
            PracticeFollowUpMessage.practice_record_id == pr.id
        ).delete(synchronize_session=False)
        db.delete(pr)
        count += 1
    gradings = db.query(GradingResult).filter(GradingResult.question_id == question_id).all()
    for grading in gradings:
        _delete_grading(db, grading)
    db.commit()
    return count


def batch_delete_records(db: Session, record_ids: list[str]) -> int:
    """Batch delete practice records by IDs, including their grading results."""
    count = 0
    for rid in record_ids:
        pr = db.get(PracticeRecord, rid)
        if not pr:
            continue
        gradings = db.query(GradingResult).filter(
            (GradingResult.practice_record_id == rid) | (GradingResult.id == pr.grading_id)
        ).all()
        for grading in gradings:
            _delete_grading(db, grading)
        db.query(PracticeFollowUpMessage).filter(
            PracticeFollowUpMessage.practice_record_id == rid
        ).delete(synchronize_session=False)
        db.delete(pr)
        count += 1
    db.commit()
    return count


def wrong_questions(db: Session) -> list[Question]:
    wrong_ids = latest_wrong_question_ids(db)
    if not wrong_ids:
        return []
    return db.query(Question).filter(Question.id.in_(wrong_ids)).all()


def _delete_grading(db: Session, grading: GradingResult) -> None:
    db.query(PracticeFollowUpMessage).filter(
        PracticeFollowUpMessage.grading_result_id == grading.id
    ).delete(synchronize_session=False)
    db.delete(grading)


def latest_wrong_question_ids(db: Session) -> list[str]:
    """Return questions whose most recent grading is not correct.

    A question graduates from the wrong-question set as soon as the latest
    attempt is correct. Older failures remain in history but no longer keep the
    question permanently marked as wrong.
    """
    rows = (
        db.query(GradingResult.question_id, GradingResult.verdict)
        .order_by(GradingResult.created_at.desc(), GradingResult.id.desc())
        .all()
    )
    latest: dict[str, str] = {}
    for question_id, verdict in rows:
        latest.setdefault(question_id, verdict)
    return [question_id for question_id, verdict in latest.items() if verdict != "correct"]


def latest_low_score_question_ids(db: Session, max_score: int = 50) -> list[str]:
    """Return question IDs whose latest saved grading score is <= ``max_score``.

    Older low scores stay in attempt history, but a later score above the
    threshold graduates the question from this retry set.
    """
    rows = (
        db.query(GradingResult.question_id, GradingResult.score)
        .order_by(GradingResult.created_at.desc(), GradingResult.id.desc())
        .all()
    )
    latest: dict[str, int] = {}
    for question_id, score in rows:
        latest.setdefault(question_id, score)
    return [
        question_id for question_id, score in latest.items()
        if score is not None and score <= max_score
    ]
