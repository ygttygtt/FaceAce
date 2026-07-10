"""Question bank request/response schemas."""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class QuestionBase(BaseModel):
    question_text: str
    question_type: str = "short_answer"
    difficulty: str = "medium"
    tags: list[str] = []
    options: Optional[list[str]] = None
    standard_answer: Optional[str] = None
    answer_points: list[str] = []
    explanation: Optional[str] = None
    code_template: Optional[str] = None
    image_placeholders: list = []
    source_file: Optional[str] = None
    source_page: Optional[int] = None
    source_raw_index: Optional[int] = None
    metadata_: dict[str, Any] = {}
    review_status: str = "approved"
    deck_id: Optional[str] = None
    group_id: Optional[str] = None
    group_seq: Optional[int] = None
    group_label: Optional[str] = None


class QuestionCreate(QuestionBase):
    pass


class QuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    question_type: Optional[str] = None
    difficulty: Optional[str] = None
    tags: Optional[list[str]] = None
    options: Optional[list[str]] = None
    standard_answer: Optional[str] = None
    answer_points: Optional[list[str]] = None
    explanation: Optional[str] = None
    code_template: Optional[str] = None
    image_placeholders: Optional[list] = None
    review_status: Optional[str] = None
    deck_id: Optional[str] = None
    user_answer_override: Optional[str] = None


class QuestionOut(QuestionBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime
    updated_at: datetime
    is_bookmarked: bool = False
    has_notes: bool = False
    user_answer_override: Optional[str] = None


class BatchDeleteRequest(BaseModel):
    ids: list[str]


class BatchMoveRequest(BaseModel):
    ids: list[str]
    deck_id: Optional[str] = None  # None = move to "unassigned"


class DrawParams(BaseModel):
    mode: str = "random"  # random | tag | difficulty | wrong | mixed
    limit: int = 10
    tags: list[str] = []
    difficulty: Optional[str] = None
