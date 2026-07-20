"""Deterministic post-extraction checks for missed and over-split questions."""
from __future__ import annotations

from dataclasses import asdict, dataclass
import re

from app.ingest.boundary_analyzer import IngestChunk, question_similarity
from app.ingest.chunker import IngestPlan
from app.schemas.llm_output import NormalizedQuestion


@dataclass(slots=True)
class QuestionCandidate:
    question: NormalizedQuestion
    chunk: IngestChunk


@dataclass(slots=True)
class AuditIssue:
    code: str
    severity: str
    message: str
    block_start: int | None = None
    block_end: int | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(slots=True)
class AuditResult:
    questions: list[NormalizedQuestion]
    issues: list[AuditIssue]
    duplicate_count: int

    def to_artifact(self, plan: IngestPlan) -> dict:
        return {
            "summary": {
                "explicit_question_count": plan.explicit_question_count,
                "result_count": len(self.questions),
                "duplicates_removed": self.duplicate_count,
                "issue_count": len(self.issues),
            },
            "issues": [issue.to_dict() for issue in self.issues],
            "plan": plan.to_artifact(),
        }


def audit_candidates(candidates: list[QuestionCandidate], plan: IngestPlan) -> AuditResult:
    kept: list[QuestionCandidate] = []
    issues: list[AuditIssue] = []
    duplicate_count = 0
    for candidate in candidates:
        duplicate_of = next((existing for existing in kept if _is_duplicate(existing, candidate)), None)
        if duplicate_of is not None:
            duplicate_count += 1
            issues.append(AuditIssue(
                code="overlap_duplicate_removed",
                severity="info",
                message=f"已移除滑动窗口重复识别：{candidate.question.question_text[:80]}",
                block_start=candidate.chunk.block_start,
                block_end=candidate.chunk.block_end,
            ))
            continue
        kept.append(candidate)

    strong_chunks = [item for item in plan.chunks if item.expected_count == 1]
    strong_covered = {
        item.chunk.block_start for item in kept if item.chunk.boundary_type == "explicit_question_heading"
    }
    for item in strong_chunks:
        if item.boundary_type == "explicit_question_heading" and item.block_start not in strong_covered:
            issues.append(AuditIssue(
                code="explicit_question_missing",
                severity="error",
                message=f"明确题目标题未成功提取：{item.heading or item.text[:80]}",
                block_start=item.block_start,
                block_end=item.block_end,
            ))

    if plan.explicit_question_count and len(strong_covered) != plan.explicit_question_count:
        issues.append(AuditIssue(
            code="explicit_count_mismatch",
            severity="error",
            message=(
                f"原文有 {plan.explicit_question_count} 个明确题目标题，"
                f"成功覆盖 {len(strong_covered)} 个"
            ),
        ))

    _audit_declared_section_counts(plan, kept, issues)

    covered_blocks: set[int] = set()
    for item in kept:
        covered_blocks.update(range(item.chunk.block_start, item.chunk.block_end + 1))
    for block in plan.blocks:
        if block.block_id in covered_blocks or block.kind == "heading":
            continue
        text = block.text.strip()
        if _looks_like_question(text):
            issues.append(AuditIssue(
                code="possible_question_uncovered",
                severity="warning",
                message=f"疑似题目未被覆盖：{text[:100]}",
                block_start=block.block_id,
                block_end=block.block_id,
            ))

    return AuditResult([item.question for item in kept], issues, duplicate_count)


def _audit_declared_section_counts(
    plan: IngestPlan,
    kept: list[QuestionCandidate],
    issues: list[AuditIssue],
) -> None:
    declarations: dict[str, int] = {}
    for decision in plan.heading_decisions:
        if decision.category != "section":
            continue
        match = re.search(r"[（(]?\s*(\d+)\s*道\s*[)）]?", decision.title)
        if match:
            declarations[decision.title] = int(match.group(1))
    if not declarations:
        return
    for section, expected in declarations.items():
        actual = sum(
            1 for item in kept
            if item.chunk.boundary_type == "explicit_question_heading" and item.chunk.section == section
        )
        if actual != expected:
            issues.append(AuditIssue(
                code="section_declared_count_mismatch",
                severity="warning",
                message=f"章节“{section}”声明 {expected} 道，实际识别 {actual} 道",
            ))


def _is_duplicate(left: QuestionCandidate, right: QuestionCandidate) -> bool:
    similarity = question_similarity(left.question.question_text, right.question.question_text)
    if similarity >= 0.92:
        return True
    left_blocks = set(range(left.chunk.block_start, left.chunk.block_end + 1))
    right_blocks = set(range(right.chunk.block_start, right.chunk.block_end + 1))
    union = left_blocks | right_blocks
    overlap = len(left_blocks & right_blocks) / len(union) if union else 0
    return overlap >= 0.65 and similarity >= 0.72


def _looks_like_question(text: str) -> bool:
    if "?" in text or "？" in text:
        return True
    return bool(re.match(
        r"^(?:题\s*\d+|Q\s*\d+|第.+题|\d+[.、)）]).*(?:什么|如何|为什么|区别|请|设计|实现|解释|分析)",
        text,
        re.IGNORECASE,
    ))
