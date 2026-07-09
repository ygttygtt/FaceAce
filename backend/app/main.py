"""FastAPI application entry point.

Run dev server:
    cd backend
    uvicorn app.main:app --reload --port 8000

Single-process (production-ish): build the frontend once (npm run build in frontend/),
then this app serves the built SPA from frontend/dist — no separate vite process needed.
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import config as config_routes
from app.api.routes import decks as decks_routes
from app.api.routes import health as health_routes
from app.api.routes import ingest as ingest_routes
from app.api.routes import practice as practice_routes
from app.api.routes import questions as questions_routes
from app.api.routes import simulation as simulation_routes
from app.core.config import settings
from app.core.logging import setup_logging
from app.db.seed import seed_default_data
from app.db.session import SessionLocal, init_db

# frontend build output (served by this app in single-process mode)
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


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


app = FastAPI(title="FaceAce 面试助手", version="0.1.0", lifespan=lifespan)

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


# ---- single-process SPA hosting (only when frontend is built) ----
if FRONTEND_DIST.exists():
    # built JS/CSS chunks live under /assets
    _assets = FRONTEND_DIST / "assets"
    if _assets.exists():
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        # unmatched API paths should 404 as JSON, not return index.html
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not Found")
        # serve other real static files at dist root (favicon, robots.txt, etc.)
        if full_path:
            candidate = FRONTEND_DIST / full_path
            if candidate.is_file():
                return FileResponse(candidate)
        # everything else (SPA routes like /practice) → index.html
        return FileResponse(FRONTEND_DIST / "index.html")
