"""Practice and grading schemas."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


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
    user_answer: str
    practice_record_id: Optional[str] = None


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
    created_at: datetime


class GradeStreamChunk(BaseModel):
    """SSE streaming chunk for grading."""
    delta: Optional[str] = None
    done: bool = False
    result: Optional["GradingResultOut"] = None
    error: Optional[str] = None
