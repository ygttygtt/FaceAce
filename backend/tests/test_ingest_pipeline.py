import asyncio
import json

from app.ingest import pipeline
from app.ingest.extractor import ExtractedText
from app.models.ingest import IngestJob
from app.schemas.llm_output import NormalizedQuestion


def test_pipeline_reports_progress_and_keeps_partial_results(db, tmp_path, monkeypatch):
    source = tmp_path / "sample.md"
    source.write_text("题目", encoding="utf-8")
    normalized = tmp_path / "normalized.json"
    errors = tmp_path / "errors.json"
    monkeypatch.setattr(pipeline, "job_dir", lambda _job_id: tmp_path)
    monkeypatch.setattr(pipeline, "normalized_file", lambda _job_id: normalized)
    monkeypatch.setattr(pipeline, "errors_file", lambda _job_id: errors)
    monkeypatch.setattr(pipeline, "build_llm_service", lambda _db, _profile_id: object())
    monkeypatch.setattr(
        pipeline,
        "extract",
        lambda _path: ExtractedText("sample.md", ["全文"], "全文"),
    )
    monkeypatch.setattr(pipeline, "chunk", lambda _text: ["第一段", "第二段"])

    async def fake_normalize(_db, _llm, text):
        if text == "第二段":
            raise RuntimeError("模拟超时")
        return [NormalizedQuestion(question_text="第一题")]

    monkeypatch.setattr(pipeline, "normalize_chunk", fake_normalize)
    job = IngestJob(id="pipeline-job", file_name="sample.md", file_path=str(source))
    db.add(job)
    db.commit()

    asyncio.run(pipeline.run_pipeline(db, job))
    db.refresh(job)

    assert job.status == "pending_review"
    assert job.progress_current == 2
    assert job.progress_total == 2
    assert job.question_count == 1
    assert job.warning_count == 1
    assert "可点击重试" in (job.error_message or "")
    assert json.loads(normalized.read_text(encoding="utf-8"))[0]["source_raw_index"] == 1
    assert json.loads(errors.read_text(encoding="utf-8"))[0]["chunk_number"] == 2
