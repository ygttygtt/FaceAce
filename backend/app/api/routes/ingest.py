"""Ingest (document import) routes."""
import json
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import INGEST_DIR
from app.core.ids import new_id
from app.ingest.pipeline import normalized_file, process_job_background
from app.models.ingest import IngestJob
from app.models.question import Question
from app.schemas.ingest import (
    ApproveRequest,
    ImportJsonRequest,
    IngestJobDetail,
    IngestJobOut,
    ReviewItemUpdate,
)

router = APIRouter(tags=["ingest"])

SUPPORTED_EXT = {".md", ".txt", ".docx", ".pdf"}


def _question_dict_from_normalized(d: dict, file_name: str, deck_id: str | None = None) -> dict:
    return {
        "id": new_id(),
        "question_text": d.get("question_text", ""),
        "question_type": d.get("question_type", "short_answer"),
        "difficulty": d.get("difficulty", "medium"),
        "tags": d.get("tags") or [],
        "options": d.get("options"),
        "standard_answer": d.get("standard_answer"),
        "answer_points": d.get("answer_points") or [],
        "explanation": d.get("explanation"),
        "code_template": d.get("code_template"),
        "image_placeholders": [],
        "source_file": file_name,
        "source_raw_index": d.get("source_raw_index", 0),
        "review_status": "approved",
        "deck_id": deck_id,
        "group_id": d.get("group_id"),
        "group_seq": d.get("group_seq"),
        "group_label": d.get("group_label"),
    }


def _load_normalized(job_id: str) -> list[dict]:
    nf = normalized_file(job_id)
    if not nf.exists():
        return []
    return json.loads(nf.read_text(encoding="utf-8"))


@router.post("/ingest/upload", status_code=201)
async def upload(
    background: BackgroundTasks,
    file: UploadFile,
    db: Session = Depends(get_db),
    profile_id: str | None = None,
    auto_approve: bool = False,
):
    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_EXT:
        raise HTTPException(status_code=400, detail=f"不支持的格式 {ext},支持 .md/.txt/.docx/.pdf")

    job = IngestJob(id=new_id(), file_name=file.filename, file_path="", status="queued")
    save_dir = INGEST_DIR / job.id
    save_dir.mkdir(parents=True, exist_ok=True)
    save_path = save_dir / file.filename
    content = await file.read()
    save_path.write_bytes(content)
    job.file_path = str(save_path)

    db.add(job)
    db.commit()
    db.refresh(job)

    background.add_task(
        process_job_background, job.id, str(save_path), profile_id, auto_approve
    )
    return IngestJobOut.model_validate(job).model_dump()


@router.get("/ingest/jobs")
def list_jobs(db: Session = Depends(get_db)):
    items = db.query(IngestJob).order_by(IngestJob.created_at.desc()).all()
    return {"items": [IngestJobOut.model_validate(j).model_dump() for j in items]}


@router.get("/ingest/jobs/{jid}")
def get_job(jid: str, db: Session = Depends(get_db)):
    j = db.get(IngestJob, jid)
    if not j:
        raise HTTPException(status_code=404, detail="导入任务不存在")
    questions = _load_normalized(jid)
    detail = IngestJobDetail.model_validate(j).model_dump()
    detail["questions"] = questions
    return detail


@router.patch("/ingest/jobs/{jid}/questions/{index}")
def update_review_item(
    jid: str, index: int, data: ReviewItemUpdate, db: Session = Depends(get_db)
):
    """Edit a pending question by its positional index in normalized.json."""
    j = db.get(IngestJob, jid)
    if not j:
        raise HTTPException(status_code=404, detail="导入任务不存在")
    items = _load_normalized(jid)
    if index < 0 or index >= len(items):
        raise HTTPException(status_code=404, detail="题目索引不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        items[index][k] = v
    normalized_file(jid).write_text(
        json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return items[index]


@router.post("/ingest/jobs/{jid}/approve")
def approve(jid: str, req: ApproveRequest, db: Session = Depends(get_db)):
    j = db.get(IngestJob, jid)
    if not j:
        raise HTTPException(status_code=404, detail="导入任务不存在")
    items = _load_normalized(jid)
    if not items:
        raise HTTPException(status_code=400, detail="无归一化结果可入库")
    if req.auto_approve_all:
        selected = items
    else:
        sel = set(req.indices)
        selected = [items[i] for i in range(len(items)) if i in sel]

    for it in selected:
        db.add(Question(**_question_dict_from_normalized(it, j.file_name, req.deck_id)))
    j.status = "done"
    db.commit()
    return {"approved": len(selected), "status": j.status}


@router.post("/ingest/import-json")
def import_json(req: ImportJsonRequest, db: Session = Depends(get_db)):
    """Directly import already-structured questions (skips extraction & LLM).

    Accepts the standard format (see docs/schema.md). Useful when another agent
    has already normalized the data, or for sharing/importing a deck.
    """
    from app.schemas.llm_output import NormalizedQuestion

    inserted = 0
    skipped = 0
    for i, raw in enumerate(req.questions):
        try:
            q = NormalizedQuestion.model_validate(raw)
        except Exception:
            skipped += 1
            continue
        db.add(
            Question(
                **_question_dict_from_normalized(q.model_dump(), "(json-import)", req.deck_id)
            )
        )
        inserted += 1
    db.commit()
    return {"inserted": inserted, "skipped": skipped}


@router.delete("/ingest/jobs/{jid}", status_code=204)
def delete_job(jid: str, db: Session = Depends(get_db)):
    j = db.get(IngestJob, jid)
    if not j:
        raise HTTPException(status_code=404, detail="导入任务不存在")
    db.delete(j)
    db.commit()
    # also remove artifacts
    import shutil

    d = INGEST_DIR / jid
    if d.exists():
        shutil.rmtree(d, ignore_errors=True)
    return None
