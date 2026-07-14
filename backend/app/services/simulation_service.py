"""Simulation session service: create, list, detail, streaming chat, finish."""
from collections.abc import AsyncGenerator
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.llm.prompts import get_prompt_content, render_template
from app.llm.service import LLMService
from app.models.question import Question
from app.models.simulation import SimulationMessage, SimulationSession
from app.schemas.simulation import SimulationSessionCreate

# Keep system + last N turns to stay within context budget.
MAX_HISTORY_MESSAGES = 30


def create_session(db: Session, data: SimulationSessionCreate) -> SimulationSession:
    s = SimulationSession(
        id=new_id(),
        title=data.title,
        role_context=data.role_context,
        status="active",
        llm_profile_id=data.llm_profile_id,
        interviewer_persona=data.interviewer_persona,
        question_pool_ids=data.question_pool_ids,
        started_at=datetime.utcnow(),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def list_sessions(db: Session) -> list[SimulationSession]:
    return (
        db.query(SimulationSession)
        .order_by(SimulationSession.created_at.desc())
        .all()
    )


def get_session_detail(db: Session, session_id: str) -> SimulationSession | None:
    return db.get(SimulationSession, session_id)


def _build_messages(db: Session, session: SimulationSession) -> list[dict]:
    persona = get_prompt_content(db, "interviewer_persona")
    if session.interviewer_persona:
        persona += f"\n【面试官风格补充】\n{session.interviewer_persona}"
    role_block = f"【候选人背景】\n{session.role_context}" if session.role_context else ""
    pool_block = ""
    if session.question_pool_ids:
        qs = db.query(Question).filter(Question.id.in_(session.question_pool_ids)).all()
        if qs:
            by_id = {q.id: q for q in qs}
            ordered = [by_id[qid] for qid in session.question_pool_ids if qid in by_id][:20]
            summary = "\n".join(
                f"- {q.question_text[:100]}"
                + (f"；评估要点：{'、'.join((q.answer_points or [])[:3])}" if q.answer_points else "")
                for q in ordered
            )
            pool_block = (
                f"【本次面试建议覆盖的题目方向】\n{summary}\n"
                "请按面试节奏自然展开，并根据评估要点追问；不要向候选人直接透露评估要点。"
            )
    system = render_template(
        persona, {"role_context_block": role_block, "question_pool_block": pool_block}
    )

    msgs: list[dict] = [{"role": "system", "content": system}]
    history = (
        db.query(SimulationMessage)
        .filter(SimulationMessage.session_id == session.id)
        .order_by(SimulationMessage.seq)
        .all()
    )
    if len(history) > MAX_HISTORY_MESSAGES:
        history = history[-MAX_HISTORY_MESSAGES:]
    for m in history:
        role = "assistant" if m.role == "interviewer" else "user"
        msgs.append({"role": role, "content": m.content})
    return msgs


async def send_message_stream(
    db: Session, llm: LLMService, session_id: str, content: str
) -> AsyncGenerator[str, None]:
    session = db.get(SimulationSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    if session.status != "active":
        raise HTTPException(status_code=400, detail="会话已结束,无法继续对话")

    last = (
        db.query(SimulationMessage)
        .filter(SimulationMessage.session_id == session_id)
        .order_by(SimulationMessage.seq.desc())
        .first()
    )
    seq = (last.seq + 1) if last else 1
    cand = SimulationMessage(
        id=new_id(), session_id=session_id, role="candidate", content=content, seq=seq
    )
    db.add(cand)
    db.commit()

    messages = _build_messages(db, session)

    collected: list[str] = []
    async for delta in llm.chat_stream(messages):
        collected.append(delta)
        yield delta

    full = "".join(collected)
    imsg = SimulationMessage(
        id=new_id(), session_id=session_id, role="interviewer", content=full, seq=seq + 1
    )
    db.add(imsg)
    db.commit()


async def opening_message_stream(
    db: Session, llm: LLMService, session_id: str
) -> AsyncGenerator[str, None]:
    """Generate the interviewer's opening line for a fresh session."""
    session = db.get(SimulationSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    # ask the interviewer to start the interview
    seed = (
        "请以面试官身份开始这场模拟面试:简短开场,确认候选人准备好了,然后抛出第一个问题。"
        + (f"目标岗位/背景参考:{session.role_context}" if session.role_context else "")
    )
    collected: list[str] = []
    async for delta in llm.chat_stream(_build_messages(db, session) + [{"role": "user", "content": seed}]):
        collected.append(delta)
        yield delta
    full = "".join(collected)
    db.add(
        SimulationMessage(
            id=new_id(), session_id=session_id, role="interviewer", content=full, seq=1
        )
    )
    db.commit()


async def retry_interviewer_stream(
    db: Session, llm: LLMService, session_id: str
) -> AsyncGenerator[str, None]:
    """Regenerate an interviewer reply after a failed stream without duplicating the candidate answer."""
    session = db.get(SimulationSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    if session.status != "active":
        raise HTTPException(status_code=400, detail="会话已结束,无法继续对话")

    last = (
        db.query(SimulationMessage)
        .filter(SimulationMessage.session_id == session_id)
        .order_by(SimulationMessage.seq.desc())
        .first()
    )
    if not last or last.role != "candidate":
        raise HTTPException(status_code=400, detail="没有可重试的候选人回答")

    collected: list[str] = []
    async for delta in llm.chat_stream(_build_messages(db, session)):
        collected.append(delta)
        yield delta

    full = "".join(collected)
    db.add(
        SimulationMessage(
            id=new_id(),
            session_id=session_id,
            role="interviewer",
            content=full,
            seq=last.seq + 1,
        )
    )
    db.commit()
