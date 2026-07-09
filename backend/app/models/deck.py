"""Deck (question set) model — groups questions into manageable sets."""
from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.ids import new_id
from app.db.base import Base, TimestampMixin


class Deck(Base, TimestampMixin):
    __tablename__ = "decks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(128))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String(16), default="blue")  # for UI badge
    question_count: Mapped[int] = mapped_column(Integer, default=0)  # cached count
