import asyncio
import json

from app.ingest import pipeline
from app.ingest.block_parser import ContentBlock
from app.ingest.boundary_analyzer import IngestChunk
from app.ingest.chunker import IngestPlan
from app.ingest.extractor import ExtractedText
from app.models.ingest import IngestJob
from app.schemas.llm_output import NormalizedQuestion


def test_pipeline_reports_progress_and_keeps_partial_results(db, tmp_path, monkeypatch):
    source = tmp_path / "sample.md"
    source.write_text("题目", encoding="utf-8")
    normalized = tmp_path / "normalized.json"
    errors = tmp_path / "errors.json"
    audit = tmp_path / "audit.json"
    monkeypatch.setattr(pipeline, "job_dir", lambda _job_id: tmp_path)
    monkeypatch.setattr(pipeline, "normalized_file", lambda _job_id: normalized)
    monkeypatch.setattr(pipeline, "errors_file", lambda _job_id: errors)
    monkeypatch.setattr(pipeline, "audit_file", lambda _job_id: audit)
    monkeypatch.setattr(pipeline, "build_llm_service", lambda _db, _profile_id: object())
    monkeypatch.setattr(
        pipeline,
        "extract",
        lambda _path: ExtractedText("sample.md", ["全文"], "全文"),
    )
    blocks = [
        ContentBlock(1, "paragraph", "第一段", 1, 1),
        ContentBlock(2, "paragraph", "第二段", 2, 2),
    ]
    chunks = [
        IngestChunk("第一段", [blocks[0]], "explicit_question_heading", 1, "题1｜第一题"),
        IngestChunk("第二段", [blocks[1]], "explicit_question_heading", 1, "题2｜第二题"),
    ]
    monkeypatch.setattr(
        pipeline,
        "plan_document",
        lambda _text: IngestPlan(blocks, [], chunks, explicit_question_count=2),
    )

    async def fake_normalize(_db, _llm, text, **_kwargs):
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
    assert job.warning_count == 3  # one failure plus explicit-boundary/count audit findings
    assert "可点击重试" in (job.error_message or "")
    assert json.loads(normalized.read_text(encoding="utf-8"))[0]["source_raw_index"] == 1
    assert json.loads(errors.read_text(encoding="utf-8"))[0]["chunk_number"] == 2
    assert json.loads(audit.read_text(encoding="utf-8"))["summary"]["explicit_question_count"] == 2


def test_eight_explicit_headings_stay_eight_when_last_one_is_over_split(db, tmp_path, monkeypatch):
    source = tmp_path / "eight.md"
    source.write_text("""# 场景题
## Agent 类
### 题1｜问题一？
答案一
### 题2｜问题二？
答案二
### 题3｜问题三？
答案三
### 题4｜问题四？
答案四
### 题5｜问题五？
答案五
### 题6｜问题六？
答案六
### 题7｜问题七？
答案七
### 题8｜实时语音 Agent 的完整设计？
#### 用户打断如何处理？
1. 停止播放
2. 取消生成
#### 低延迟 RAG
并行检索。
#### 可观测与降级策略
记录链路并提供降级。
""", encoding="utf-8")
    normalized = tmp_path / "normalized-eight.json"
    errors = tmp_path / "errors-eight.json"
    audit = tmp_path / "audit-eight.json"
    monkeypatch.setattr(pipeline, "job_dir", lambda _job_id: tmp_path)
    monkeypatch.setattr(pipeline, "normalized_file", lambda _job_id: normalized)
    monkeypatch.setattr(pipeline, "errors_file", lambda _job_id: errors)
    monkeypatch.setattr(pipeline, "audit_file", lambda _job_id: audit)

    class OverSplittingLLM:
        async def structured(self, messages, _schema, **_kwargs):
            prompt = messages[0]["content"]
            if "题8｜" in prompt:
                return type("Result", (), {"questions": [
                    NormalizedQuestion(question_text="实时语音 Agent 的完整设计？"),
                    NormalizedQuestion(question_text="用户打断如何处理？"),
                    NormalizedQuestion(question_text="低延迟 RAG 怎么做？"),
                    NormalizedQuestion(question_text="可观测怎么做？"),
                    NormalizedQuestion(question_text="降级策略是什么？"),
                ]})()
            return type("Result", (), {"questions": [
                NormalizedQuestion(question_text="普通问题")
            ]})()

    monkeypatch.setattr(pipeline, "build_llm_service", lambda _db, _profile_id: OverSplittingLLM())
    job = IngestJob(id="eight-job", file_name=source.name, file_path=str(source))
    db.add(job)
    db.commit()

    asyncio.run(pipeline.run_pipeline(db, job))

    items = json.loads(normalized.read_text(encoding="utf-8"))
    audit_data = json.loads(audit.read_text(encoding="utf-8"))
    assert job.status == "pending_review"
    assert job.question_count == 8
    assert len(items) == 8
    assert items[-1]["question_text"] == "实时语音 Agent 的完整设计？"
    assert audit_data["summary"]["explicit_question_count"] == 8
    assert audit_data["summary"]["result_count"] == 8
