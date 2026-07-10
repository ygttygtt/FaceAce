"""User bookmarks on questions."""
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.ids import new_id
from app.db.base import Base, TimestampMixin


class Bookmark(Base, TimestampMixin):
    __tablename__ = "bookmarks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    question_id: Mapped[str] = mapped_column(String(32), ForeignKey("questions.id"), index=True)
