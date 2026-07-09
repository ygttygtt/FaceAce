"""Heuristic pre-chunking of extracted text before LLM normalization.

Splits on common question-number markers (1. / Q1 / (1) / 一、 / 第1题 / 问:).
When no markers are found, falls back to a fixed-size sliding window.
Then merges segments into chunks that stay within a token budget.
"""
import re

# Matches a question-number prefix OR a markdown section header at line start.
# Headers are included so a chunk never spans across a section boundary
# (which previously leaked the next section title into an answer).
QUESTION_NUM_RE = re.compile(
    r"(?:^|\n)\s*(?:Q\d+|第[一二三四五六七八九十百\d]+题|\d+[\.、\)）]|[一二三四五六七八九十]+[、．\.]|\(\d+\)|问[:：]|#{1,3}\s+\S)\s*"
)


def chunk(text: str, max_chars: int = 2000) -> list[str]:
    text = text.strip()
    if not text:
        return []

    markers = list(QUESTION_NUM_RE.finditer(text))
    if not markers:
        return _sliding(text, max_chars)

    starts = [m.start() for m in markers]
    segments: list[str] = []
    # optional preamble before first marker
    if starts[0] > 0:
        pre = text[: starts[0]].strip()
        if pre:
            segments.append(pre)
    starts.append(len(text))
    for i in range(len(starts) - 1):
        seg = text[starts[i] : starts[i + 1]].strip()
        if seg:
            segments.append(seg)

    # merge segments into chunks within budget
    chunks: list[str] = []
    buf = ""
    for seg in segments:
        if not buf:
            buf = seg
        elif len(buf) + len(seg) + 2 <= max_chars:
            buf = buf + "\n\n" + seg
        else:
            chunks.append(buf)
            buf = seg
        # single oversized segment -> sliding split
        if len(buf) > max_chars:
            chunks.extend(_sliding(buf, max_chars))
            buf = ""
    if buf:
        chunks.append(buf)
    return chunks


def _sliding(text: str, max_chars: int) -> list[str]:
    text = text.strip()
    if not text:
        return []
    return [text[i : i + max_chars] for i in range(0, len(text), max_chars)]
