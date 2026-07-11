"""PDF OCR fallback tests."""

from pathlib import Path
from unittest.mock import MagicMock, patch

from app.services.file_processor import file_processor


def test_extract_pdf_falls_back_to_ocr(tmp_path: Path):
    pdf_path = tmp_path / "scan.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    page = MagicMock()
    page.extract_text.return_value = ""
    reader = MagicMock()
    reader.pages = [page]

    with patch("pypdf.PdfReader", return_value=reader):
        with patch(
            "app.services.file_processor.extract_text_from_pdf_pages",
            return_value="OCR extracted rewards table",
        ):
            text = file_processor._extract_pdf(pdf_path)

    assert text == "OCR extracted rewards table"
