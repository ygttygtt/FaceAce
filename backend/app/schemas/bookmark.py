from datetime import datetime
from pydantic import BaseModel, ConfigDict


class BookmarkCreate(BaseModel):
    question_id: str


class BookmarkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    question_id: str
    created_at: datetime
