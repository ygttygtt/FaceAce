"""Application configuration loaded from .env via pydantic-settings."""
import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/  (parent of app/)
BACKEND_DIR: Path = Path(__file__).resolve().parent.parent.parent
# backend/data/ in development, or a launcher-provided portable data directory.
DATA_DIR: Path = Path(os.environ.get("FACEACE_DATA_DIR", BACKEND_DIR / "data")).resolve()
INGEST_DIR: Path = DATA_DIR / "ingest"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---- Database ----
    database_url: str = ""

    # ---- Default LLM profile (seeded on first start) ----
    llm_base_url: str = "https://api.deepseek.com/v1"
    llm_api_key: str = ""
    llm_model: str = "deepseek-v4-flash"
    llm_temperature: float = 0.7
    llm_max_tokens: int = 2048

    # ---- CORS ----
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()

# Resolve default sqlite path relative to backend/data so it works regardless of cwd.
if not settings.database_url:
    db_path = (DATA_DIR / "faceace.db").as_posix()
    settings.database_url = f"sqlite:///{db_path}"

# Ensure data dirs exist.
DATA_DIR.mkdir(parents=True, exist_ok=True)
INGEST_DIR.mkdir(parents=True, exist_ok=True)
