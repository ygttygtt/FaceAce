"""Parse extracted text into stable, source-addressable content blocks.

The parser deliberately does *not* decide where questions begin.  It only
preserves enough document structure for rules and the LLM boundary detector to
make that decision without copying or rewriting the source text.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
import re


HEADING_RE = re.compile(r"^\s*(#{1,6})\s+(.+?)\s*$")
LIST_RE = re.compile(r"^\s*(?:[-*+]\s+|\d+[.、)）]\s+|[一二三四五六七八九十]+[、.]\s+)")


@dataclass(slots=True)
class ContentBlock:
    block_id: int
    kind: str
    text: str
    line_start: int
    line_end: int
    heading_level: int | None = None
    heading_path: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def parse_blocks(text: str) -> list[ContentBlock]:
    """Return paragraph-sized blocks while keeping headings/code/tables intact."""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    blocks: list[ContentBlock] = []
    heading_stack: list[tuple[int, str]] = []
    index = 0
    next_id = 1

    def append(kind: str, value: str, start: int, end: int, level: int | None = None) -> None:
        nonlocal next_id
        value = value.strip("\n")
        if not value.strip():
            return
        blocks.append(ContentBlock(
            block_id=next_id,
            kind=kind,
            text=value,
            line_start=start,
            line_end=end,
            heading_level=level,
            heading_path=[title for _, title in heading_stack],
        ))
        next_id += 1

    while index < len(lines):
        line = lines[index]
        line_no = index + 1
        if not line.strip():
            index += 1
            continue

        heading = HEADING_RE.match(line)
        if heading:
            level = len(heading.group(1))
            title = heading.group(2).strip()
            while heading_stack and heading_stack[-1][0] >= level:
                heading_stack.pop()
            heading_stack.append((level, title))
            append("heading", title, line_no, line_no, level)
            index += 1
            continue

        if line.lstrip().startswith("```"):
            start = index
            index += 1
            while index < len(lines):
                if lines[index].lstrip().startswith("```"):
                    index += 1
                    break
                index += 1
            append("code", "\n".join(lines[start:index]), start + 1, index)
            continue

        if "|" in line and index + 1 < len(lines) and _is_table_separator(lines[index + 1]):
            start = index
            index += 2
            while index < len(lines) and "|" in lines[index] and lines[index].strip():
                index += 1
            append("table", "\n".join(lines[start:index]), start + 1, index)
            continue

        kind = "list" if LIST_RE.match(line) else "paragraph"
        start = index
        buffer = [line]
        index += 1
        while index < len(lines) and lines[index].strip():
            if HEADING_RE.match(lines[index]) or lines[index].lstrip().startswith("```"):
                break
            current_kind = "list" if LIST_RE.match(lines[index]) else "paragraph"
            if current_kind != kind:
                break
            if kind == "list" and LIST_RE.match(lines[index]):
                # Each top-level list item remains addressable; indented lines stay attached.
                break
            buffer.append(lines[index])
            index += 1
        append(kind, "\n".join(buffer), start + 1, index)

    return blocks


def _is_table_separator(line: str) -> bool:
    cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell or "") for cell in cells)
