"""Deck (question set) schemas."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class DeckCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "blue"


class DeckUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


class DeckOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: Optional[str]
    color: str
    question_count: int
    created_at: datetime
