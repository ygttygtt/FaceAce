import json

from app.api.routes import ingest as ingest_routes
from app.models.ingest import IngestJob
from app.models.question import Question
from app.schemas.ingest import ApproveRequest


def test_partial_approval_keeps_remaining_questions_pending(db, tmp_path, monkeypatch):
    normalized = tmp_path / "normalized.json"
    normalized.write_text(
        json.dumps([
            {"question_text": "题目一", "source_raw_index": 1},
            {"question_text": "题目二", "source_raw_index": 2},
        ], ensure_ascii=False),
        encoding="utf-8",
    )
    monkeypatch.setattr(ingest_routes, "normalized_file", lambda _job_id: normalized)

    job = IngestJob(
        id="job1",
        file_name="sample.md",
        file_path=str(tmp_path / "sample.md"),
        status="pending_review",
        question_count=2,
    )
    db.add(job)
    db.commit()

    result = ingest_routes.approve(
        job.id,
        ApproveRequest(indices=[0], auto_approve_all=False),
        db,
    )

    assert result == {"approved": 1, "remaining": 1, "status": "pending_review"}
    assert db.query(Question).count() == 1
    assert json.loads(normalized.read_text(encoding="utf-8"))[0]["question_text"] == "题目二"
