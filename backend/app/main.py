"""FastAPI application entry point — API only.

The backend is a pure JSON API server. The frontend is always served
by Vite (dev) or a static file server (prod). They are independent
processes. Use dev.bat to start both.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import bookmarks as bookmark_routes
from app.api.routes import config as config_routes
from app.api.routes import decks as decks_routes
from app.api.routes import health as health_routes
from app.api.routes import ingest as ingest_routes
from app.api.routes import notes as note_routes
from app.api.routes import practice as practice_routes
from app.api.routes import questions as questions_routes
from app.api.routes import simulation as simulation_routes
from app.api.routes import tts as tts_routes
from app.core.config import settings
from app.core.logging import setup_logging
from app.db.seed import seed_default_data
from app.db.session import SessionLocal, init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    init_db()
    db = SessionLocal()
    try:
        seed_default_data(db)
    finally:
        db.close()
    yield


app = FastAPI(title="FaceAce 面试助手", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_routes.router, prefix="/api")
app.include_router(config_routes.router, prefix="/api")
app.include_router(decks_routes.router, prefix="/api")
app.include_router(questions_routes.router, prefix="/api")
app.include_router(practice_routes.router, prefix="/api")
app.include_router(simulation_routes.router, prefix="/api")
app.include_router(ingest_routes.router, prefix="/api")
app.include_router(bookmark_routes.router, prefix="/api")
app.include_router(note_routes.router, prefix="/api")
app.include_router(tts_routes.router, prefix="/api")
