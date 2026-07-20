"""Candidate generation and semantic question-boundary discovery."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from difflib import SequenceMatcher
import re

from pydantic import BaseModel, Field

from app.ingest.block_parser import ContentBlock
from app.llm.service import LLMService


EXPLICIT_QUESTION_RE = re.compile(
    r"^(?:题\s*\d+|Q\s*\d+|第\s*[一二三四五六七八九十百\d]+\s*题)"
    r"(?:\s*[｜|:：.、)）\-]|\s*$)",
    re.IGNORECASE,
)
NUMBERED_RE = re.compile(r"^(?:\d+\s*[.、)）]|[一二三四五六七八九十]+\s*[、.]|\(\d+\))\s*")
ANSWER_RE = re.compile(r"^(?:参考)?(?:答案|解析|解答|答题要点|评分要点|考察点|思路)(?:\s*[:：]|$)")
FOLLOW_UP_RE = re.compile(r"^(?:追问|进阶|延伸|补充问题)(?:\s*\d+)?(?:\s*[:：]|$)")
SECTION_RE = re.compile(r"(?:类|篇|章|部分|目录|题库|知识点|基础|高级|专题)(?:\s*[（(].*[)）])?$", re.IGNORECASE)
QUESTION_CUE_RE = re.compile(
    r"(?:什么|为何|为什么|如何|怎样|怎么|是否|能否|区别|优缺点|请|设计|实现|分析|解释|描述|谈谈|哪些|哪种|多少|吗|呢)[？?]?$"
)


@dataclass(slots=True)
class HeadingDecision:
    block_id: int
    title: str
    category: str
    confidence: float
    reason: str

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(slots=True)
class IngestChunk:
    text: str
    blocks: list[ContentBlock]
    boundary_type: str
    expected_count: int | None = None
    heading: str | None = None
    section: str | None = None
    confidence: float = 0.5
    source_window: int = 0

    @property
    def block_start(self) -> int:
        return self.blocks[0].block_id if self.blocks else 0

    @property
    def block_end(self) -> int:
        return self.blocks[-1].block_id if self.blocks else 0

    def to_artifact(self) -> dict:
        return {
            "boundary_type": self.boundary_type,
            "expected_count": self.expected_count,
            "heading": self.heading,
            "section": self.section,
            "confidence": self.confidence,
            "block_start": self.block_start,
            "block_end": self.block_end,
            "source_window": self.source_window,
            "preview": self.text[:240],
        }


class BoundarySpan(BaseModel):
    start_block: int
    end_block: int
    title: str = ""
    confidence: float = Field(default=0.5, ge=0, le=1)
    continues_from_previous: bool = False
    continues_to_next: bool = False


class BoundarySpans(BaseModel):
    questions: list[BoundarySpan] = Field(default_factory=list)


def classify_heading(block: ContentBlock) -> HeadingDecision:
    title = block.text.strip()
    if ANSWER_RE.match(title):
        return HeadingDecision(block.block_id, title, "answer", 0.99, "答案/解析标记")
    if FOLLOW_UP_RE.match(title):
        return HeadingDecision(block.block_id, title, "follow_up", 0.97, "追问标记")
    if EXPLICIT_QUESTION_RE.match(title):
        return HeadingDecision(block.block_id, title, "question", 0.99, "明确题号标题")
    without_number = NUMBERED_RE.sub("", title).strip()
    if NUMBERED_RE.match(title) and ("?" in title or "？" in title or QUESTION_CUE_RE.search(without_number)):
        return HeadingDecision(block.block_id, title, "question", 0.9, "编号且具有问句语义")
    if ("?" in title or "？" in title) and re.search(
        r"(?:什么|为何|为什么|如何|怎样|怎么|是否|能否|区别|优缺点|请|设计|实现|分析|解释|描述|哪些|哪种)",
        title,
    ):
        # Unnumbered interrogative headings are valuable candidates, but not a
        # hard one-question contract: they may be subquestions inside an answer.
        return HeadingDecision(block.block_id, title, "question", 0.72, "标题具有问句语义，需结合上下文")
    if block.heading_level and block.heading_level <= 2 or SECTION_RE.search(title):
        return HeadingDecision(block.block_id, title, "section", 0.86, "章节层级或分类语义")
    return HeadingDecision(block.block_id, title, "unknown", 0.45, "仅作为候选，等待上下文判断")


async def discover_question_chunks(llm: LLMService, candidate: IngestChunk) -> list[IngestChunk]:
    """Ask the LLM only for source spans, never rewritten question content.

    Failure is intentionally non-fatal: the caller can normalize the original
    candidate window.  This keeps imports usable with smaller or less capable
    OpenAI-compatible models.
    """
    if candidate.expected_count == 1 or not candidate.blocks:
        return [candidate]
    indexed = "\n\n".join(f"[B{b.block_id}] {b.text}" for b in candidate.blocks)
    prompt = f"""你负责识别面试题的原文边界，不要改写或回答题目。
下面是带稳定编号的文档块。标题、编号和问号都只是候选证据；答案里的编号步骤、反问句、示例问题不能当成新题。
请返回 JSON：{{"questions":[{{"start_block":1,"end_block":3,"title":"题目简述","confidence":0.9,"continues_from_previous":false,"continues_to_next":false}}]}}。
要求：
1. start_block/end_block 必须使用输入中真实存在的 B 编号，且 start<=end。
2. 每个 span 表示一道主问题及其答案/解析；同一语境的多个子问优先保留为复合题。
3. “追问”只有明确作为独立练习题时才单列，否则归入主问题。
4. 章节介绍、目录和纯答案不要输出。

【候选窗口】
{indexed}"""
    result = await llm.structured([{"role": "user", "content": prompt}], BoundarySpans, temperature=0.0)
    if result is None:
        return []
    by_id = {block.block_id: block for block in candidate.blocks}
    chunks: list[IngestChunk] = []
    seen_ranges: set[tuple[int, int]] = set()
    for span in result.questions:
        # Never clamp hallucinated positions onto real content: doing so can
        # silently turn an invalid answer into a false question boundary.
        if span.start_block not in by_id or span.end_block not in by_id:
            continue
        start, end = span.start_block, span.end_block
        if start > end or span.confidence < 0.45 or (start, end) in seen_ranges:
            continue
        selected = [b for b in candidate.blocks if start <= b.block_id <= end]
        if not selected:
            continue
        seen_ranges.add((start, end))
        chunks.append(IngestChunk(
            text=_render_blocks(selected, candidate.section),
            blocks=selected,
            boundary_type="semantic_question",
            expected_count=1,
            heading=span.title or None,
            section=candidate.section,
            confidence=span.confidence,
            source_window=candidate.source_window,
        ))
    return chunks


def question_similarity(left: str, right: str) -> float:
    def clean(value: str) -> str:
        return re.sub(r"[\W_]+", "", value.lower())
    a, b = clean(left), clean(right)
    if not a or not b:
        return 0.0
    if a in b or b in a:
        return min(len(a), len(b)) / max(len(a), len(b))
    return SequenceMatcher(None, a, b).ratio()


def _render_blocks(blocks: list[ContentBlock], section: str | None = None) -> str:
    body = "\n\n".join(
        ("#" * (b.heading_level or 1) + " " + b.text) if b.kind == "heading" else b.text
        for b in blocks
    ).strip()
    if section and not body.startswith("【所属章节】"):
        return f"【所属章节】{section}\n{body}"
    return body
