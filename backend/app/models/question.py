"""Question bank model."""
from typing import Any

from sqlalchemy import JSON, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.ids import new_id
from app.db.base import Base, TimestampMixin


class Question(Base, TimestampMixin):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[str] = mapped_column(String(32), default="short_answer")
    difficulty: Mapped[str] = mapped_column(String(16), default="medium")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    options: Mapped[list | None] = mapped_column(JSON, nullable=True)
    standard_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer_points: Mapped[list] = mapped_column(JSON, default=list)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    code_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_placeholders: Mapped[list] = mapped_column(JSON, default=list)
    source_file: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_raw_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    review_status: Mapped[str] = mapped_column(String(16), default="approved")
    deck_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    # question group / follow-up chain: questions sharing group_id form an ordered chain
    group_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    group_seq: Mapped[int | None] = mapped_column(Integer, nullable=True)
    group_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
