"""Document ingestion and text extraction."""

import re
from pathlib import Path

from app.core.logging import logger
from app.services.ocr_service import extract_text_from_image, extract_text_from_pdf_pages


class FileProcessor:
    """Extract text from uploaded files for RAG indexing."""

    CHUNK_SIZE = 1000
    CHUNK_OVERLAP = 200

    IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"}

    def extract_text(self, file_path: Path, mime_type: str) -> str:
        suffix = file_path.suffix.lower()

        if suffix == ".pdf" or mime_type == "application/pdf":
            return self._extract_pdf(file_path)
        if suffix == ".docx" or "wordprocessingml" in mime_type:
            return self._extract_docx(file_path)
        if suffix in self.IMAGE_SUFFIXES or mime_type.startswith("image/"):
            return extract_text_from_image(file_path)
        if suffix in (".txt", ".md", ".json", ".py", ".ts", ".tsx", ".js"):
            return file_path.read_text(encoding="utf-8", errors="ignore")

        logger.warning("Unsupported file type: %s — attempting plain read", mime_type)
        try:
            return file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return f"[Unsupported file: {file_path.name}]"

    def _extract_pdf(self, file_path: Path) -> str:
        from pypdf import PdfReader

        reader = PdfReader(str(file_path))
        pages = [page.extract_text() or "" for page in reader.pages]
        text = "\n".join(pages)
        if text.strip():
            return text

        logger.info("PDF has no extractable text — trying OCR: %s", file_path.name)
        ocr_text = extract_text_from_pdf_pages(file_path)
        if ocr_text.strip():
            logger.info("PDF OCR extracted %d characters from %s", len(ocr_text), file_path.name)
            return ocr_text

        logger.info("PDF OCR produced no text: %s", file_path.name)
        return text

    def _extract_docx(self, file_path: Path) -> str:
        from docx import Document

        doc = Document(str(file_path))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())

    def chunk_text(self, text: str) -> list[str]:
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            return []

        chunks: list[str] = []
        start = 0
        while start < len(text):
            end = start + self.CHUNK_SIZE
            chunks.append(text[start:end])
            start = end - self.CHUNK_OVERLAP
        return chunks


file_processor = FileProcessor()
