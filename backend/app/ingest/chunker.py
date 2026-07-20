"""Structure-aware candidate generation for document ingestion.

Rules in this module generate *candidates*, not final questions.  Explicit
question headings are the sole hard boundary because they carry an expected
count of one; ambiguous headings and unstructured prose are emitted as
overlapping natural-boundary windows for semantic analysis.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import re

from app.ingest.block_parser import ContentBlock, parse_blocks
from app.ingest.boundary_analyzer import (
    HeadingDecision,
    IngestChunk,
    NUMBERED_RE,
    classify_heading,
    _render_blocks,
)


@dataclass(slots=True)
class IngestPlan:
    blocks: list[ContentBlock]
    heading_decisions: list[HeadingDecision]
    chunks: list[IngestChunk]
    explicit_question_count: int = 0
    notes: list[str] = field(default_factory=list)

    def to_artifact(self) -> dict:
        return {
            "block_count": len(self.blocks),
            "explicit_question_count": self.explicit_question_count,
            "headings": [item.to_dict() for item in self.heading_decisions],
            "chunks": [item.to_artifact() for item in self.chunks],
            "notes": self.notes,
        }


def plan_document(text: str, max_chars: int = 3200, overlap_ratio: float = 0.15) -> IngestPlan:
    blocks = _expand_oversized_blocks(parse_blocks(text), max_chars * 2)
    decisions = [classify_heading(block) for block in blocks if block.kind == "heading"]
    decision_by_id = {item.block_id: item for item in decisions}
    explicit_indexes = [
        i for i, block in enumerate(blocks)
        if block.kind == "heading"
        and decision_by_id[block.block_id].category == "question"
        and decision_by_id[block.block_id].confidence >= 0.8
    ]
    chunks: list[IngestChunk] = []
    consumed: set[int] = set()

    for position, start_index in enumerate(explicit_indexes):
        start_block = blocks[start_index]
        next_question_index = explicit_indexes[position + 1] if position + 1 < len(explicit_indexes) else len(blocks)
        end_index = next_question_index
        # A higher-level section closes the current question. Answer/unknown
        # subheadings stay inside it even when they happen to use the same level.
        for cursor in range(start_index + 1, next_question_index):
            current = blocks[cursor]
            decision = decision_by_id.get(current.block_id)
            if (
                decision
                and decision.category == "section"
                and current.heading_level is not None
                and start_block.heading_level is not None
                and current.heading_level < start_block.heading_level
            ):
                end_index = cursor
                break
        selected = blocks[start_index:end_index]
        if not selected:
            continue
        section = _parent_section(start_block)
        chunks.append(IngestChunk(
            text=_render_blocks(selected, section),
            blocks=selected,
            boundary_type="explicit_question_heading",
            expected_count=1,
            heading=start_block.text,
            section=section,
            confidence=decision_by_id[start_block.block_id].confidence,
            source_window=len(chunks) + 1,
        ))
        consumed.update(block.block_id for block in selected)

    # Everything not covered by a strong heading remains eligible for semantic
    # discovery. This catches e.g. a chapter heading containing several plain
    # questions and mixed documents with only some explicit question titles.
    remainder_groups = _unconsumed_groups(blocks, consumed, decision_by_id)
    for group in remainder_groups:
        for window in _generic_windows(group, max_chars=max_chars, overlap_ratio=overlap_ratio):
            window.source_window = len(chunks) + 1
            chunks.append(window)

    chunks.sort(key=lambda item: (item.block_start, item.block_end, item.boundary_type != "explicit_question_heading"))
    for i, item in enumerate(chunks, start=1):
        item.source_window = i
    notes: list[str] = []
    if explicit_indexes:
        notes.append(f"发现 {len(explicit_indexes)} 个高置信度题目标题，已设置每段期望 1 题")
    if any(item.boundary_type == "semantic_window" for item in chunks):
        notes.append("不确定区域将由 AI 判断题目边界")
    return IngestPlan(blocks, decisions, chunks, len(explicit_indexes), notes)


def chunk(text: str, max_chars: int = 3200) -> list[str]:
    """Backward-compatible string view used by CLI callers and older tests."""
    return [item.text for item in plan_document(text, max_chars=max_chars).chunks]


def _unconsumed_groups(
    blocks: list[ContentBlock], consumed: set[int], decisions: dict[int, HeadingDecision]
) -> list[list[ContentBlock]]:
    groups: list[list[ContentBlock]] = []
    current: list[ContentBlock] = []
    for block in blocks:
        if block.block_id in consumed:
            if current:
                groups.append(current)
                current = []
            continue
        decision = decisions.get(block.block_id)
        if decision and decision.category == "section" and current and _has_substantive_content(current):
            groups.append(current)
            current = []
        current.append(block)
    if current:
        groups.append(current)
    return [group for group in groups if _has_substantive_content(group)]


def _has_substantive_content(blocks: list[ContentBlock]) -> bool:
    non_headings = "\n".join(block.text for block in blocks if block.kind != "heading").strip()
    return len(non_headings) >= 8


def _generic_windows(
    blocks: list[ContentBlock], max_chars: int, overlap_ratio: float
) -> list[IngestChunk]:
    if not blocks:
        return []
    section = next((b.text for b in blocks if b.kind == "heading"), None)
    numbered_positions = [i for i, block in enumerate(blocks) if NUMBERED_RE.match(block.text.strip())]
    if len(numbered_positions) >= 2:
        segments: list[list[ContentBlock]] = []
        first = numbered_positions[0]
        prefix = blocks[:first]
        for pos, start in enumerate(numbered_positions):
            end = numbered_positions[pos + 1] if pos + 1 < len(numbered_positions) else len(blocks)
            selected = blocks[start:end]
            if pos == 0 and prefix:
                selected = prefix + selected
            segments.append(selected)
        result: list[IngestChunk] = []
        buffer: list[ContentBlock] = []
        count = 0
        for segment in segments:
            proposed = buffer + segment
            if buffer and (len(_render_blocks(proposed, section)) > max_chars or count >= 3):
                result.append(_semantic_window(buffer, section))
                buffer = []
                count = 0
            buffer.extend(segment)
            count += 1
        if buffer:
            result.append(_semantic_window(buffer, section))
        return result

    windows: list[IngestChunk] = []
    start = 0
    overlap_target = max(160, int(max_chars * overlap_ratio))
    while start < len(blocks):
        end = start
        size = 0
        while end < len(blocks):
            addition = len(blocks[end].text) + 2
            if end > start and size + addition > max_chars:
                break
            size += addition
            end += 1
        if end == start:
            end += 1
        selected = blocks[start:end]
        windows.append(_semantic_window(selected, section))
        if end >= len(blocks):
            break
        overlap_size = 0
        next_start = end
        while next_start > start + 1 and overlap_size < overlap_target:
            next_start -= 1
            overlap_size += len(blocks[next_start].text) + 2
        start = next_start if next_start > start else end
    return windows


def _semantic_window(blocks: list[ContentBlock], section: str | None) -> IngestChunk:
    return IngestChunk(
        text=_render_blocks(blocks, section),
        blocks=blocks,
        boundary_type="semantic_window",
        expected_count=None,
        section=section,
        confidence=0.5,
    )


def _parent_section(block: ContentBlock) -> str | None:
    if not block.heading_path:
        return None
    parents = block.heading_path[:-1]
    return parents[-1] if parents else None


def _expand_oversized_blocks(blocks: list[ContentBlock], hard_limit: int) -> list[ContentBlock]:
    """Split a pathological paragraph at sentence boundaries, never blindly mid-char."""
    result: list[ContentBlock] = []
    next_id = 1
    for block in blocks:
        pieces = [block.text]
        if len(block.text) > hard_limit and block.kind not in {"code", "table", "heading"}:
            sentences = re.split(r"(?<=[。！？!?；;])\s*|\n+", block.text)
            pieces, current = [], ""
            for sentence in sentences:
                if not sentence:
                    continue
                if current and len(current) + len(sentence) > hard_limit:
                    pieces.append(current)
                    current = ""
                current += sentence
            if current:
                pieces.append(current)
        for piece in pieces:
            result.append(ContentBlock(
                block_id=next_id,
                kind=block.kind,
                text=piece,
                line_start=block.line_start,
                line_end=block.line_end,
                heading_level=block.heading_level,
                heading_path=list(block.heading_path),
            ))
            next_id += 1
    return result
