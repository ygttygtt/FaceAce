"""Simulation session schemas."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class SimulationSessionCreate(BaseModel):
    title: str = "模拟面试"
    role_context: Optional[str] = None
    llm_profile_id: Optional[str] = None
    interviewer_persona: Optional[str] = None
    question_pool_ids: list[str] = []


class SimulationSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    role_context: Optional[str]
    status: str
    llm_profile_id: Optional[str]
    interviewer_persona: Optional[str]
    question_pool_ids: list[str]
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    created_at: datetime


class SimulationMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    session_id: str
    role: str
    content: str
    seq: int
    tts_played: bool
    created_at: datetime


class SimulationSessionDetail(SimulationSessionOut):
    messages: list[SimulationMessageOut] = []


class SendMessageRequest(BaseModel):
    content: str


class SimulationReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    session_id: str
    overall_score: int
    overall_summary: str
    strengths: list[str]
    weaknesses: list[str]
    improvement_suggestions: list[str]
    question_feedbacks: list
    created_at: datetime
