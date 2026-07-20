"""Practice and grading schemas."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class PracticeRecordCreate(BaseModel):
    question_id: str
    user_answer: Optional[str] = None
    revealed: bool = False
    duration_sec: int = 0


class PracticeRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    question_id: str
    user_answer: Optional[str]
    revealed: bool
    duration_sec: int
    grading_id: Optional[str]
    created_at: datetime


class GradeRequest(BaseModel):
    question_id: str
    user_answer: str = Field(min_length=1)
    practice_record_id: Optional[str] = None
    include_independent_analysis: bool = False


class GradingResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    question_id: str
    practice_record_id: Optional[str]
    score: int
    verdict: str
    strengths: list[str]
    weaknesses: list[str]
    missing_points: list[str]
    detailed_feedback: str
    improved_answer: Optional[str]
    independent_analysis: Optional[str] = None
    created_at: datetime


class GradeStreamChunk(BaseModel):
    """SSE streaming chunk for grading."""
    delta: Optional[str] = None
    done: bool = False
    result: Optional["GradingResultOut"] = None
    error: Optional[str] = None


class PracticeRecordDetailOut(PracticeRecordOut):
    """Enriched practice record with grading result and question info."""
    grading: Optional["GradingResultOut"] = None
    question: Optional[dict] = None


class PracticeFollowUpRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)


class PracticeFollowUpMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    practice_record_id: str
    grading_result_id: str
    role: str
    content: str
    created_at: datetime


class PracticeFollowUpResponse(BaseModel):
    user_message: PracticeFollowUpMessageOut
    assistant_message: PracticeFollowUpMessageOut
