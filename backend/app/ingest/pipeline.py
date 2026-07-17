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


def errors_file(job_id: str) -> Path:
    return job_dir(job_id) / "errors.json"


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
    deck_id: str | None = None,
) -> IngestJob:
    jdir = job_dir(job.id)

    try:
        job.error_message = None
        job.warning_count = 0
        job.question_count = 0
        job.progress_current = 0
        job.progress_total = 0
        # 0) resolve LLM (may raise if no profile configured)
        llm = build_llm_service(db, profile_id)
        # 1) extract
        job.status = "extracting"
        job.stage_message = "正在读取文档内容"
        db.commit()
        extracted = extract(job.file_path)
        (jdir / "extracted.txt").write_text(extracted.full_text, encoding="utf-8")
        job.extracted_text = extracted.full_text

        # 2) split + process with progress updates
        chunks = chunk(extracted.full_text)
        if not chunks:
            raise ValueError("文档中没有可处理的文字内容")
        job.status = "processing"
        job.progress_total = len(chunks)
        job.stage_message = f"已拆分为 {len(chunks)} 个内容分段"
        db.commit()
        all_questions: list[NormalizedQuestion] = []
        errors: list[dict] = []
        for i, c in enumerate(chunks):
            job.progress_current = i
            job.stage_message = f"正在识别第 {i + 1} / {len(chunks)} 个内容分段"
            db.commit()
            try:
                qs = await normalize_chunk(db, llm, c)
                if not qs:
                    raise ValueError("AI 未从该分段识别出题目")
                all_questions.extend(qs)
            except Exception as e:  # noqa: BLE001
                logger.warning("chunk %d normalize failed: %s", i, e)
                errors.append({
                    "chunk_index": i,
                    "chunk_number": i + 1,
                    "preview": c[:160].replace("\n", " "),
                    "error": str(e)[:500],
                })
            job.progress_current = i + 1
            job.question_count = len(all_questions)
            job.warning_count = len(errors)
            db.commit()

        for index, question in enumerate(all_questions, start=1):
            question.source_raw_index = index

        # 3) persist artifacts
        normalized_data = [q.model_dump() for q in all_questions]
        normalized_file(job.id).write_text(
            json.dumps(normalized_data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        if errors:
            errors_file(job.id).write_text(
                json.dumps(errors, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        elif errors_file(job.id).exists():
            errors_file(job.id).unlink()

        job.question_count = len(all_questions)
        job.warning_count = len(errors)

        # 4) store
        if not all_questions:
            job.status = "failed"
            job.error_message = "没有成功识别出题目，请查看错误后重试"
            job.stage_message = "导入失败"
        elif auto_approve:
            for q in all_questions:
                d = _to_question_dict(q, job.file_name)
                d["deck_id"] = deck_id
                db.add(Question(**d))
            job.status = "done"
            job.stage_message = f"已导入 {len(all_questions)} 题"
        else:
            job.status = "pending_review"
            job.stage_message = (
                f"识别出 {len(all_questions)} 题，{len(errors)} 个分段需要重试"
                if errors
                else f"识别出 {len(all_questions)} 题，等待审核"
            )
        if errors and all_questions:
            job.error_message = f"有 {len(errors)} 个内容分段未成功处理，可点击重试"
        db.commit()
    except Exception as e:  # noqa: BLE001
        job.status = "failed"
        job.error_message = str(e)[:1000]
        job.stage_message = "导入失败"
        db.commit()
        logger.exception("ingest pipeline failed for job %s", job.id)
        raise
    return job


async def process_job_background(
    job_id: str, file_path: str, profile_id: str | None, auto_approve: bool, deck_id: str | None = None
) -> None:
    """Background runner owning its own DB session (for FastAPI BackgroundTasks)."""
    db = SessionLocal()
    try:
        job = db.get(IngestJob, job_id)
        if not job:
            return
        await run_pipeline(db, job, profile_id=profile_id, auto_approve=auto_approve, deck_id=deck_id)
    finally:
        db.close()
