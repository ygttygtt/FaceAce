from app.ingest.auditor import QuestionCandidate, audit_candidates
from app.ingest.block_parser import ContentBlock
from app.ingest.boundary_analyzer import HeadingDecision, IngestChunk
from app.ingest.chunker import IngestPlan
from app.schemas.llm_output import NormalizedQuestion


def test_overlap_duplicate_is_removed_but_distinct_explicit_questions_are_kept():
    blocks = [ContentBlock(i, "paragraph", f"块{i}", i, i) for i in range(1, 8)]
    window1 = IngestChunk("窗口一", blocks[:5], "semantic_question", 1)
    window2 = IngestChunk("窗口二", blocks[2:], "semantic_question", 1)
    candidates = [
        QuestionCandidate(NormalizedQuestion(question_text="如何避免缓存穿透？"), window1),
        QuestionCandidate(NormalizedQuestion(question_text="如何避免缓存穿透"), window2),
    ]
    plan = IngestPlan(blocks, [], [window1, window2])

    result = audit_candidates(candidates, plan)

    assert len(result.questions) == 1
    assert result.duplicate_count == 1
    assert any(item.code == "overlap_duplicate_removed" for item in result.issues)


def test_declared_section_count_mismatch_is_reported():
    blocks = [ContentBlock(1, "heading", "RAG 类（4 道）", 1, 1, 2)]
    heading = HeadingDecision(1, "RAG 类（4 道）", "section", 0.9, "分类标题")
    plan = IngestPlan(blocks, [heading], [], explicit_question_count=0)

    result = audit_candidates([], plan)

    assert any(item.code == "section_declared_count_mismatch" for item in result.issues)
