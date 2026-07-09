"""Structured LLM output schemas (used for validation & JSON-schema generation)."""
from typing import Optional

from pydantic import BaseModel, Field


# ---- Part1: question normalization ----
class NormalizedQuestion(BaseModel):
    question_text: str
    question_type: str = "short_answer"
    difficulty: str = "medium"
    tags: list[str] = Field(default_factory=list)
    options: Optional[list[str]] = None
    standard_answer: Optional[str] = None
    answer_points: list[str] = Field(default_factory=list)
    explanation: Optional[str] = None
    code_template: Optional[str] = None
    source_raw_index: int = 0
    # optional: follow-up chain grouping (追问/进阶 linked questions)
    group_id: Optional[str] = None
    group_seq: Optional[int] = None
    group_label: Optional[str] = None


class NormalizedQuestions(BaseModel):
    """Wrapper used for json_object response mode (must be a JSON object)."""
    questions: list[NormalizedQuestion] = Field(default_factory=list)


# ---- Part2: grading ----
class GradingResultLLM(BaseModel):
    score: int = Field(ge=0, le=100)
    verdict: str  # correct | partially_correct | incorrect
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    missing_points: list[str] = Field(default_factory=list)
    detailed_feedback: str = ""
    improved_answer: Optional[str] = None


# ---- Part2: simulation report ----
class QuestionFeedback(BaseModel):
    question: str = ""
    feedback: str = ""
    score: int = 0


class SimulationReportLLM(BaseModel):
    overall_score: int = Field(ge=0, le=100)
    overall_summary: str = ""
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    improvement_suggestions: list[str] = Field(default_factory=list)
    question_feedbacks: list[QuestionFeedback] = Field(default_factory=list)
