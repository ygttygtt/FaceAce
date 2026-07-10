"""Models package. Importing this registers all ORM models on Base.metadata."""
from app.models.config import LLMProfile, PromptTemplate, UserConfig
from app.models.deck import Deck
from app.models.bookmark import Bookmark  # noqa
from app.models.ingest import IngestJob
from app.models.note import Note  # noqa
from app.models.practice import GradingResult, PracticeRecord
from app.models.question import Question
from app.models.simulation import (
    SimulationMessage,
    SimulationReport,
    SimulationSession,
)

__all__ = [
    "Bookmark",
    "Note",
    "Question",
    "Deck",
    "PracticeRecord",
    "GradingResult",
    "SimulationSession",
    "SimulationMessage",
    "SimulationReport",
    "IngestJob",
    "LLMProfile",
    "PromptTemplate",
    "UserConfig",
]
