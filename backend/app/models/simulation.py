"""Simulation session, messages, and report models."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.ids import new_id
from app.db.base import Base, TimestampMixin


class SimulationSession(Base, TimestampMixin):
    __tablename__ = "simulation_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(255), default="模拟面试")
    role_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active | finished
    llm_profile_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    interviewer_persona: Mapped[str | None] = mapped_column(Text, nullable=True)
    question_pool_ids: Mapped[list] = mapped_column(JSON, default=list)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class SimulationMessage(Base, TimestampMixin):
    __tablename__ = "simulation_messages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(String(32), ForeignKey("simulation_sessions.id"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # interviewer | candidate
    content: Mapped[str] = mapped_column(Text, default="")
    seq: Mapped[int] = mapped_column(Integer, default=0)
    tts_played: Mapped[bool] = mapped_column(default=False)


class SimulationReport(Base, TimestampMixin):
    __tablename__ = "simulation_reports"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(String(32), ForeignKey("simulation_sessions.id"), unique=True)
    overall_score: Mapped[int] = mapped_column(Integer, default=0)
    overall_summary: Mapped[str] = mapped_column(Text, default="")
    strengths: Mapped[list] = mapped_column(JSON, default=list)
    weaknesses: Mapped[list] = mapped_column(JSON, default=list)
    improvement_suggestions: Mapped[list] = mapped_column(JSON, default=list)
    question_feedbacks: Mapped[list] = mapped_column(JSON, default=list)
    raw_response: Mapped[str] = mapped_column(Text, default="")
