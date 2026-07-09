"""Ingest pipeline orchestration: extract -> chunk -> normalize -> validate -> store."""
import json
import logging
from pathlib import Path

from sqlalchemy.orm import Session

from app.api.deps import build_llm_service
from app.core.config import INGEST_DIR
from app.core.ids import new_id
from app.db.session import SessionLocal
from app.ingest.chunker import chunk
from app.ingest.extractor import extract
from app.ingest.normalizer import normalize_chunk
from app.models.ingest import IngestJob
from app.models.question import Question
from app.schemas.llm_output import NormalizedQuestion

logger = logging.getLogger(__name__)


def job_dir(job_id: str) -> Path:
    d = INGEST_DIR / job_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def normalized_file(job_id: str) -> Path:
    return job_dir(job_id) / "normalized.json"


def _to_question_dict(q: NormalizedQuestion, file_name: str) -> dict:
    return {
        "id": new_id(),
        "question_text": q.question_text,
        "question_type": q.question_type,
        "difficulty": q.difficulty,
        "tags": q.tags,
        "options": q.options,
        "standard_answer": q.standard_answer,
        "answer_points": q.answer_points,
        "explanation": q.explanation,
        "code_template": q.code_template,
        "image_placeholders": [],
        "source_file": file_name,
        "source_raw_index": q.source_raw_index,
        "review_status": "approved",
    }


async def run_pipeline(
    db: Session,
    job: IngestJob,
    profile_id: str | None = None,
    auto_approve: bool = False,
) -> IngestJob:
    jdir = job_dir(job.id)

    try:
        # 0) resolve LLM (may raise if no profile configured)
        llm = build_llm_service(db, profile_id)
        # 1) extract
        job.status = "extracting"
        db.commit()
        extracted = extract(job.file_path)
        (jdir / "extracted.txt").write_text(extracted.full_text, encoding="utf-8")
        job.extracted_text = extracted.full_text

        # 2) chunk + normalize
        job.status = "normalizing"
        db.commit()
        chunks = chunk(extracted.full_text)
        all_questions: list[NormalizedQuestion] = []
        errors: list[dict] = []
        for i, c in enumerate(chunks):
            try:
                qs = await normalize_chunk(db, llm, c)
                all_questions.extend(qs)
            except Exception as e:  # noqa: BLE001
                logger.warning("chunk %d normalize failed: %s", i, e)
                errors.append({"chunk_index": i, "error": str(e)})

        # 3) persist artifacts
        normalized_data = [q.model_dump() for q in all_questions]
        normalized_file(job.id).write_text(
            json.dumps(normalized_data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        if errors:
            (jdir / "errors.json").write_text(
                json.dumps(errors, ensure_ascii=False, indent=2), encoding="utf-8"
            )

        job.question_count = len(all_questions)

        # 4) store
        if auto_approve:
            for q in all_questions:
                db.add(Question(**_to_question_dict(q, job.file_name)))
            job.status = "done"
        else:
            job.status = "pending_review"
        db.commit()
    except Exception as e:  # noqa: BLE001
        job.status = "failed"
        job.error_message = str(e)[:1000]
        db.commit()
        logger.exception("ingest pipeline failed for job %s", job.id)
        raise
    return job


async def process_job_background(
    job_id: str, file_path: str, profile_id: str | None, auto_approve: bool
) -> None:
    """Background runner owning its own DB session (for FastAPI BackgroundTasks)."""
    db = SessionLocal()
    try:
        job = db.get(IngestJob, job_id)
        if not job:
            return
        await run_pipeline(db, job, profile_id=profile_id, auto_approve=auto_approve)
    finally:
        db.close()
