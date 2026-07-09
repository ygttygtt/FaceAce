"""Database engine, session factory, and FastAPI dependency."""
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

_connect_args = (
    {"check_same_thread": False}
    if settings.database_url.startswith("sqlite")
    else {}
)

engine = create_engine(settings.database_url, connect_args=_connect_args, echo=False)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Imports models package so every model registers on Base."""
    from app import models  # noqa: F401  (registers metadata)
    from app.db.base import Base
    from app.db.migrate import run_migrations

    Base.metadata.create_all(bind=engine)
    run_migrations(engine)  # patch missing columns on existing tables
