"""Text extraction from supported document formats (lightweight, no OCR)."""
from dataclasses import dataclass


@dataclass
class ExtractedText:
    file_name: str
    pages: list[str]  # per-page for pdf; single-element for others
    full_text: str


def extract(file_path: str) -> ExtractedText:
    from pathlib import Path

    p = Path(file_path)
    ext = p.suffix.lower()
    if ext in (".md", ".txt"):
        text = p.read_text(encoding="utf-8", errors="replace")
        return ExtractedText(p.name, [text], text)
    if ext == ".docx":
        return _extract_docx(p)
    if ext == ".pdf":
        return _extract_pdf(p)
    raise ValueError(f"不支持的文件格式: {ext}(支持 .md/.txt/.docx/.pdf)")


def _extract_docx(p) -> ExtractedText:
    from docx import Document

    doc = Document(str(p))
    paras = [para.text for para in doc.paragraphs if para.text and para.text.strip()]
    text = "\n\n".join(paras)
    if not text.strip():
        raise ValueError("docx 未提取到任何文字。")
    return ExtractedText(p.name, [text], text)


def _extract_pdf(p) -> ExtractedText:
    import pdfplumber

    pages: list[str] = []
    with pdfplumber.open(str(p)) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    text = "\n\n".join(pages)
    if not text.strip():
        raise ValueError("PDF 未提取到任何文字,可能是扫描件。请提供可复制文字的 PDF。")
    return ExtractedText(p.name, pages, text)
