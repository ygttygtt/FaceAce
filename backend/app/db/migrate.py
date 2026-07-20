"""Lightweight in-process migrations for SQLite (no Alembic yet).

create_all() creates new tables but does NOT add columns to existing tables.
This module patches missing columns so existing DBs upgrade seamlessly.
"""
import json
import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.core.ids import new_id
from app.llm.default_prompts import DEFAULT_PROMPTS

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

    # Bookmark table
    if not _has_table(engine, "bookmarks"):
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE bookmarks (
                    id VARCHAR(32) PRIMARY KEY,
                    question_id VARCHAR(32) NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (question_id) REFERENCES questions(id)
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_bookmarks_question_id ON bookmarks (question_id)"))
        logger.info("migration: created bookmarks table")

    # Note table
    if not _has_table(engine, "notes"):
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE notes (
                    id VARCHAR(32) PRIMARY KEY,
                    question_id VARCHAR(32) NOT NULL,
                    content TEXT DEFAULT '',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (question_id) REFERENCES questions(id)
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_notes_question_id ON notes (question_id)"))
        logger.info("migration: created notes table")

    # user_answer_override column on questions
    if _has_table(engine, "questions") and not _has_column(engine, "questions", "user_answer_override"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE questions ADD COLUMN user_answer_override TEXT"))
        logger.info("migration: added questions.user_answer_override")

    # question_text snapshot on practice_records
    if _has_table(engine, "practice_records") and not _has_column(engine, "practice_records", "question_text"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE practice_records ADD COLUMN question_text TEXT"))
        logger.info("migration: added practice_records.question_text")

    # Independent grading second opinion (generated without imported answers).
    if _has_table(engine, "grading_results") and not _has_column(
        engine, "grading_results", "independent_analysis"
    ):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE grading_results ADD COLUMN independent_analysis TEXT"))
        logger.info("migration: added grading_results.independent_analysis")

    # Follow-up Q&A attached to a saved practice/grading result.
    if not _has_table(engine, "practice_follow_up_messages"):
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE practice_follow_up_messages (
                    id VARCHAR(32) PRIMARY KEY,
                    practice_record_id VARCHAR(32) NOT NULL,
                    grading_result_id VARCHAR(32) NOT NULL,
                    role VARCHAR(16) NOT NULL,
                    content TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (practice_record_id) REFERENCES practice_records(id),
                    FOREIGN KEY (grading_result_id) REFERENCES grading_results(id)
                )
            """))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_practice_follow_up_messages_practice_record_id "
                "ON practice_follow_up_messages (practice_record_id)"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_practice_follow_up_messages_grading_result_id "
                "ON practice_follow_up_messages (grading_result_id)"
            ))
        logger.info("migration: created practice_follow_up_messages table")

    # Import progress fields
    if _has_table(engine, "ingest_jobs"):
        ingest_columns = {
            "progress_current": "INTEGER NOT NULL DEFAULT 0",
            "progress_total": "INTEGER NOT NULL DEFAULT 0",
            "stage_message": "VARCHAR(255) NOT NULL DEFAULT ''",
            "warning_count": "INTEGER NOT NULL DEFAULT 0",
        }
        for column, definition in ingest_columns.items():
            if not _has_column(engine, "ingest_jobs", column):
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE ingest_jobs ADD COLUMN {column} {definition}"))
                logger.info("migration: added ingest_jobs.%s", column)

    if _has_table(engine, "prompt_templates"):
        with engine.begin() as conn:
            conn.execute(text(
                "UPDATE prompt_templates SET name='文档题目识别' "
                "WHERE key='normalize_questions' AND name='题目归一化'"
            ))
            # Older installations were seeded only once, so newly introduced
            # built-in prompts would otherwise work as hidden fallbacks but
            # never appear in Settings. Insert missing keys without touching
            # any user-customized rows.
            existing = {
                row[0] for row in conn.execute(text("SELECT key FROM prompt_templates")).all()
            }
            for key, info in DEFAULT_PROMPTS.items():
                if key in existing:
                    continue
                conn.execute(
                    text("""
                        INSERT INTO prompt_templates
                            (id, key, name, content, variables)
                        VALUES
                            (:id, :key, :name, :content, :variables)
                    """),
                    {
                        "id": new_id(),
                        "key": key,
                        "name": info["name"],
                        "content": info["content"],
                        "variables": json.dumps(info["variables"], ensure_ascii=False),
                    },
                )
                logger.info("migration: added prompt template %s", key)

    # Fix old invalid TTS voice values (OpenAI voice names that don't work with mimo)
    if _has_table(engine, "user_config"):
        with engine.begin() as conn:
            result = conn.execute(text("SELECT tts_voice FROM user_config WHERE id=1")).first()
            if result and result[0] and result[0] not in ("mimo_default", "冰糖", "茉莉", "苏打", "白桦", "Mia", "Chloe", "Milo", "Dean", ""):
                conn.execute(text("UPDATE user_config SET tts_voice='冰糖' WHERE id=1"))
                logger.info("migration: reset tts_voice from '%s' to '冰糖'", result[0])

    # Clean up orphaned bookmarks & notes (question was deleted but bookmark/note remained)
    if _has_table(engine, "bookmarks") and _has_table(engine, "questions"):
        with engine.begin() as conn:
            n = conn.execute(text("DELETE FROM bookmarks WHERE question_id NOT IN (SELECT id FROM questions)")).rowcount
            if n:
                logger.info("migration: cleaned %d orphaned bookmarks", n)
    if _has_table(engine, "notes") and _has_table(engine, "questions"):
        with engine.begin() as conn:
            n = conn.execute(text("DELETE FROM notes WHERE question_id NOT IN (SELECT id FROM questions)")).rowcount
            if n:
                logger.info("migration: cleaned %d orphaned notes", n)
