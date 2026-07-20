"""Ingest pipeline: extract -> structure -> boundaries -> normalize -> audit."""
import json
import logging
from pathlib import Path

from sqlalchemy.orm import Session

from app.api.deps import build_llm_service
from app.core.config import INGEST_DIR
from app.core.ids import new_id
from app.db.session import SessionLocal
from app.ingest.auditor import QuestionCandidate, audit_candidates
from app.ingest.boundary_analyzer import discover_question_chunks
from app.ingest.chunker import plan_document
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


def audit_file(job_id: str) -> Path:
    return job_dir(job_id) / "audit.json"


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

        # 2) preserve document structure and generate boundary candidates.
        plan = plan_document(extracted.full_text)
        if not plan.chunks:
            raise ValueError("文档中没有可处理的文字内容")
        job.status = "processing"
        job.progress_total = len(plan.chunks)
        job.stage_message = f"正在分析 {len(plan.chunks)} 个候选区域的题目边界"
        db.commit()
        processing_chunks = []
        errors: list[dict] = []
        for i, candidate in enumerate(plan.chunks):
            job.progress_current = i
            job.stage_message = f"正在判断第 {i + 1} / {len(plan.chunks)} 个候选区域"
            db.commit()
            if candidate.expected_count == 1:
                processing_chunks.append(candidate)
                continue
            try:
                discovered = await discover_question_chunks(llm, candidate)
                processing_chunks.extend(discovered or [candidate])
            except Exception as e:  # noqa: BLE001
                # Boundary discovery is an enhancement. Keep importing via the
                # original natural-boundary window when the model cannot return
                # usable spans.
                logger.warning("semantic boundary discovery failed for region %d: %s", i, e)
                processing_chunks.append(candidate)
                errors.append({
                    "phase": "boundary",
                    "chunk_index": i,
                    "chunk_number": i + 1,
                    "preview": candidate.text[:160].replace("\n", " "),
                    "error": f"题目边界智能判断失败，已使用兼容模式：{str(e)[:350]}",
                })
        job.progress_current = 0
        job.progress_total = len(processing_chunks)
        job.stage_message = f"已识别 {len(processing_chunks)} 个题目区域，开始整理"
        db.commit()

        # 3) normalize each resolved source region. Explicit/semantic single
        # question regions carry a hard expected_count=1 contract.
        candidates: list[QuestionCandidate] = []
        for i, candidate in enumerate(processing_chunks):
            job.progress_current = i
            job.stage_message = f"正在整理第 {i + 1} / {len(processing_chunks)} 个题目区域"
            db.commit()
            try:
                qs = await normalize_chunk(
                    db,
                    llm,
                    candidate.text,
                    expected_count=candidate.expected_count,
                    boundary_type=candidate.boundary_type,
                    question_heading=candidate.heading,
                )
                if not qs:
                    raise ValueError("AI 未从该区域识别出题目")
                candidates.extend(QuestionCandidate(question=q, chunk=candidate) for q in qs)
            except Exception as e:  # noqa: BLE001
                logger.warning("question region %d normalize failed: %s", i, e)
                errors.append({
                    "phase": "normalize",
                    "chunk_index": i,
                    "chunk_number": i + 1,
                    "preview": candidate.text[:160].replace("\n", " "),
                    "error": str(e)[:500],
                })
            job.progress_current = i + 1
            job.question_count = len(candidates)
            job.warning_count = len(errors)
            db.commit()

        # 4) remove overlap duplicates and verify explicit counts/coverage.
        job.stage_message = "正在检查遗漏、重复与误拆"
        db.commit()
        audit = audit_candidates(candidates, plan)
        all_questions = audit.questions
        for index, question in enumerate(all_questions, start=1):
            question.source_raw_index = index

        audit_file(job.id).write_text(
            json.dumps(audit.to_artifact(plan), ensure_ascii=False, indent=2), encoding="utf-8"
        )
        for issue in audit.issues:
            if issue.severity not in {"warning", "error"}:
                continue
            errors.append({
                "phase": "audit",
                "chunk_index": -1,
                "chunk_number": 0,
                "preview": "",
                "error": issue.message,
                "code": issue.code,
                "severity": issue.severity,
                "block_start": issue.block_start,
                "block_end": issue.block_end,
            })

        # 5) persist artifacts
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
        retryable_count = sum(item.get("phase") == "normalize" for item in errors)
        audit_warning_count = sum(item.get("phase") == "audit" for item in errors)

        # 6) store
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
            if retryable_count:
                job.stage_message = f"识别出 {len(all_questions)} 题，{retryable_count} 个区域需要重试"
            elif audit_warning_count:
                job.stage_message = f"识别出 {len(all_questions)} 题，{audit_warning_count} 项需重点审核"
            else:
                job.stage_message = f"识别出 {len(all_questions)} 题，等待审核"
        if retryable_count and all_questions:
            job.error_message = f"有 {retryable_count} 个题目区域未成功处理，可点击重试"
        elif audit_warning_count and all_questions:
            job.error_message = f"检测到 {audit_warning_count} 项边界或覆盖风险，请在审核时重点检查"
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
