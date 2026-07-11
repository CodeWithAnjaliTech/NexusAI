"""OCR for image documents (PNG, JPG, etc.) and scanned PDF pages."""

from pathlib import Path

from app.core.logging import logger


def extract_text_from_image(file_path: Path) -> str:
    """Extract text via Tesseract OCR when available."""
    try:
        import pytesseract
        from PIL import Image

        image = Image.open(file_path)
        text = pytesseract.image_to_string(image)
        if text.strip():
            return text.strip()
    except ImportError:
        logger.warning("pytesseract not installed — OCR unavailable")
    except Exception as exc:
        logger.warning("OCR failed: %s", exc)

    return (
        f"[Image file: {file_path.name}. OCR unavailable — install tesseract and pytesseract "
        "or upload a text/PDF version.]"
    )


def extract_text_from_pdf_pages(file_path: Path, *, max_pages: int = 20) -> str:
    """OCR scanned PDF pages when native text extraction returns empty."""
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        logger.warning("pytesseract/Pillow not installed — PDF OCR unavailable")
        return ""

    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.warning("pymupdf not installed — PDF OCR unavailable")
        return ""

    parts: list[str] = []
    try:
        doc = fitz.open(str(file_path))
        for page_index, page in enumerate(doc):
            if page_index >= max_pages:
                break
            pix = page.get_pixmap(dpi=150)
            image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            text = pytesseract.image_to_string(image)
            if text.strip():
                parts.append(text.strip())
        doc.close()
    except Exception as exc:
        logger.warning("PDF OCR failed for %s: %s", file_path.name, exc)
        return ""

    return "\n\n".join(parts).strip()

