"""Lightweight in-process migrations for SQLite (no Alembic yet).

create_all() creates new tables but does NOT add columns to existing tables.
This module patches missing columns so existing DBs upgrade seamlessly.
"""
import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def _has_column(engine: Engine, table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(engine).get_columns(table)}


def _has_table(engine: Engine, table: str) -> bool:
    return inspect(engine).has_table(table)


def run_migrations(engine: Engine) -> None:
    """Add missing columns to existing tables. Safe to call on every startup."""
    if _has_table(engine, "questions") and not _has_column(engine, "questions", "deck_id"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE questions ADD COLUMN deck_id VARCHAR(32)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_questions_deck_id ON questions (deck_id)"))
        logger.info("migration: added questions.deck_id")
    if _has_table(engine, "questions") and not _has_column(engine, "questions", "group_id"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE questions ADD COLUMN group_id VARCHAR(32)"))
            conn.execute(text("ALTER TABLE questions ADD COLUMN group_seq INTEGER"))
            conn.execute(text("ALTER TABLE questions ADD COLUMN group_label VARCHAR(128)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_questions_group_id ON questions (group_id)"))
        logger.info("migration: added questions.group_id/group_seq/group_label")
