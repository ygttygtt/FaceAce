"""Ingest (document import) schemas."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.llm_output import NormalizedQuestion


class IngestJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    file_name: str
    status: str
    question_count: int
    error_message: Optional[str]
    progress_current: int = 0
    progress_total: int = 0
    stage_message: str = ""
    warning_count: int = 0
    created_at: datetime
    updated_at: datetime


class IngestJobDetail(IngestJobOut):
    file_path: str
    extracted_text: Optional[str]
    questions: list[NormalizedQuestion] = Field(default_factory=list)
    errors: list[dict] = Field(default_factory=list)


class ReviewItemUpdate(BaseModel):
    """Patch a single pending question before approving."""
    question_text: Optional[str] = None
    question_type: Optional[str] = None
    difficulty: Optional[str] = None
    tags: Optional[list[str]] = None
    options: Optional[list[str]] = None
    standard_answer: Optional[str] = None
    answer_points: Optional[list[str]] = None
    explanation: Optional[str] = None
    code_template: Optional[str] = None
    source_raw_index: Optional[int] = None
    group_id: Optional[str] = None
    group_seq: Optional[int] = None
    group_label: Optional[str] = None


class ApproveRequest(BaseModel):
    """List of source_raw_index values to approve (1-based within the job)."""
    indices: list[int]
    auto_approve_all: bool = False
    deck_id: Optional[str] = None  # assign approved questions to this deck


class ImportJsonRequest(BaseModel):
    """Direct import of already-structured questions (skips LLM)."""
    questions: list[dict]
    deck_id: Optional[str] = None
