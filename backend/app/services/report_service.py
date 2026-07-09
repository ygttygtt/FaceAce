"""Simulation report generation service."""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.llm.prompts import render_prompt
from app.llm.service import LLMService
from app.models.simulation import (
    SimulationMessage,
    SimulationReport,
    SimulationSession,
)
from app.schemas.llm_output import SimulationReportLLM


async def generate_report(
    db: Session, llm: LLMService, session_id: str
) -> SimulationReport:
    session = db.get(SimulationSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    msgs = (
        db.query(SimulationMessage)
        .filter(SimulationMessage.session_id == session_id)
        .order_by(SimulationMessage.seq)
        .all()
    )
    if not msgs:
        raise HTTPException(status_code=400, detail="会话无对话记录,无法生成报告")

    dialogue = "\n\n".join(
        f"{'面试官' if m.role == 'interviewer' else '候选人'}: {m.content}" for m in msgs
    )
    prompt = render_prompt(
        db,
        "report_generator",
        {
            "role_context": session.role_context or "(未提供)",
            "dialogue": dialogue,
        },
    )
    result = await llm.structured(
        [{"role": "user", "content": prompt}], SimulationReportLLM, temperature=0.2
    )
    if result is None:
        raise HTTPException(status_code=502, detail="报告生成失败,请重试或检查 LLM 配置。")

    existing = (
        db.query(SimulationReport)
        .filter(SimulationReport.session_id == session_id)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()

    rep = SimulationReport(
        id=new_id(),
        session_id=session_id,
        overall_score=result.overall_score,
        overall_summary=result.overall_summary,
        strengths=result.strengths,
        weaknesses=result.weaknesses,
        improvement_suggestions=result.improvement_suggestions,
        question_feedbacks=[fb.model_dump() for fb in result.question_feedbacks],
        raw_response="",
    )
    db.add(rep)
    session.status = "finished"
    session.ended_at = datetime.utcnow()
    db.commit()
    db.refresh(rep)
    return rep


def get_report(db: Session, session_id: str) -> SimulationReport | None:
    return (
        db.query(SimulationReport)
        .filter(SimulationReport.session_id == session_id)
        .first()
    )
