"""Structure-aware chunking before LLM question extraction.

Markdown documents with explicit question headings are split one question per
chunk. Plain-text numbered questions are batched conservatively. Only truly
unstructured text falls back to fixed-size windows.
"""
import re


MARKDOWN_HEADING_RE = re.compile(r"^\s*(#{1,6})\s+(.+?)\s*$")
MARKDOWN_QUESTION_TITLE_RE = re.compile(
    r"^(?:(?:题\s*\d+|Q\s*\d+|第\s*[一二三四五六七八九十百\d]+\s*题)(?:\s*[｜|:：.、)）\-]|\s*$)|\d+\s*[\.、)）]|\(\d+\)|[一二三四五六七八九十百]+\s*[、．\.]|问[:：])",
    re.IGNORECASE,
)
PLAIN_QUESTION_RE = re.compile(
    r"(?:^|\n)\s*(?:Q\s*\d+|第[一二三四五六七八九十百\d]+题|\d+[\.、\)）]|[一二三四五六七八九十]+[、．\.]|\(\d+\)|问[:：])\s*",
    re.IGNORECASE,
)


def chunk(text: str, max_chars: int = 2600) -> list[str]:
    text = text.strip()
    if not text:
        return []

    markdown_questions = _markdown_question_chunks(text)
    if len(markdown_questions) >= 2:
        return _split_oversized(markdown_questions, max_chars * 3)

    markers = list(PLAIN_QUESTION_RE.finditer(text))
    if not markers:
        return _sliding(text, max_chars)

    segments = _segments_from_markers(text, markers)
    return _merge_short_segments(segments, max_chars=max_chars, max_segments=3)


def _markdown_question_chunks(text: str) -> list[str]:
    chunks: list[str] = []
    current: list[str] = []
    section_title = ""

    def flush() -> None:
        if not current:
            return
        body = "\n".join(current).strip().strip("-\n ")
        if body:
            prefix = f"【所属章节】{section_title}\n" if section_title else ""
            chunks.append(prefix + body)
        current.clear()

    for line in text.splitlines():
        heading = MARKDOWN_HEADING_RE.match(line)
        if heading:
            level = len(heading.group(1))
            title = heading.group(2).strip()
            if MARKDOWN_QUESTION_TITLE_RE.match(title):
                flush()
                current.append(line)
                continue
            if level <= 2:
                flush()
                section_title = title
                continue
        if current:
            current.append(line)

    flush()
    return chunks


def _segments_from_markers(text: str, markers: list[re.Match[str]]) -> list[str]:
    starts = [marker.start() for marker in markers]
    segments: list[str] = []
    starts.append(len(text))
    for index in range(len(starts) - 1):
        segment = text[starts[index] : starts[index + 1]].strip()
        if segment:
            segments.append(segment)
    return segments


def _merge_short_segments(
    segments: list[str],
    max_chars: int,
    max_segments: int,
) -> list[str]:
    chunks: list[str] = []
    buffer: list[str] = []
    buffer_length = 0
    for segment in segments:
        extra = len(segment) + (2 if buffer else 0)
        if buffer and (buffer_length + extra > max_chars or len(buffer) >= max_segments):
            chunks.append("\n\n".join(buffer))
            buffer = []
            buffer_length = 0
        buffer.append(segment)
        buffer_length += len(segment) + (2 if len(buffer) > 1 else 0)
    if buffer:
        chunks.append("\n\n".join(buffer))
    return _split_oversized(chunks, max_chars * 3)


def _split_oversized(chunks: list[str], hard_limit: int) -> list[str]:
    result: list[str] = []
    for item in chunks:
        if len(item) <= hard_limit:
            result.append(item)
        else:
            result.extend(_sliding(item, hard_limit))
    return result


def _sliding(text: str, max_chars: int) -> list[str]:
    text = text.strip()
    if not text:
        return []
    return [text[index : index + max_chars] for index in range(0, len(text), max_chars)]
