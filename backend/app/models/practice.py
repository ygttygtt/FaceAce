"""Practice (flashcard) records and AI grading results."""
from sqlalchemy import Boolean, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.ids import new_id
from app.db.base import Base, TimestampMixin


class PracticeRecord(Base, TimestampMixin):
    __tablename__ = "practice_records"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    question_id: Mapped[str] = mapped_column(String(32), ForeignKey("questions.id"), index=True)
    question_text: Mapped[str | None] = mapped_column(Text, nullable=True)  # snapshot
    user_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    revealed: Mapped[bool] = mapped_column(Boolean, default=False)
    duration_sec: Mapped[int] = mapped_column(Integer, default=0)
    grading_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("grading_results.id"), nullable=True)


class GradingResult(Base, TimestampMixin):
    __tablename__ = "grading_results"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    practice_record_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("practice_records.id"), nullable=True)
    question_id: Mapped[str] = mapped_column(String(32), ForeignKey("questions.id"), index=True)
    score: Mapped[int] = mapped_column(Integer, default=0)
    verdict: Mapped[str] = mapped_column(String(32), default="partially_correct")
    strengths: Mapped[list] = mapped_column(JSON, default=list)
    weaknesses: Mapped[list] = mapped_column(JSON, default=list)
    missing_points: Mapped[list] = mapped_column(JSON, default=list)
    detailed_feedback: Mapped[str] = mapped_column(Text, default="")
    improved_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    llm_profile_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    raw_response: Mapped[str] = mapped_column(Text, default="")
