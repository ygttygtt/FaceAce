from datetime import datetime
from pydantic import BaseModel, ConfigDict


class NoteCreate(BaseModel):
    question_id: str
    content: str = ""


class NoteUpdate(BaseModel):
    content: str


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    question_id: str
    content: str
    created_at: datetime
    updated_at: datetime
