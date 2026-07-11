"""Tests for code review zip handling."""

import io
import zipfile

import pytest

from app.services.code_review_service import safe_extract_zip, scan_project


def _make_zip(files: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    return buf.getvalue()


def test_safe_extract_and_scan(tmp_path):
    zip_bytes = _make_zip(
        {
            "myapp/main.py": "print('hello')\n# TODO: improve\n",
            "myapp/README.md": "# My App\n",
            "myapp/requirements.txt": "fastapi\n",
        }
    )
    dest = tmp_path / "out"
    safe_extract_zip(zip_bytes, dest, max_uncompressed_mb=10)
    scan = scan_project(dest, max_files=50, max_file_chars=2000)
    assert scan.code_file_count >= 2
    assert scan.total_lines >= 2
    assert "py" in scan.languages or any("main.py" in f.rel_path for f in scan.files)


def test_rejects_zip_slip(tmp_path):
    zip_bytes = _make_zip({"../evil.txt": "bad"})
    dest = tmp_path / "out"
    with pytest.raises(ValueError, match="Unsafe|Zip slip"):
        safe_extract_zip(zip_bytes, dest, max_uncompressed_mb=10)


def test_safe_write_project_files_and_scan(tmp_path):
    from app.services.code_review_service import safe_write_project_files

    dest = tmp_path / "tree"
    entries = [
        ("myapp/main.py", b"print('hello')\n"),
        ("myapp/node_modules/pkg/index.js", b"ignored"),
        ("myapp/README.md", b"# App\n"),
    ]
    safe_write_project_files(entries, dest, max_total_mb=10)
    assert (dest / "myapp" / "main.py").is_file()
    assert not (dest / "myapp" / "node_modules").exists()

    scan = scan_project(dest, max_files=50, max_file_chars=2000)
    assert scan.code_file_count >= 2


def test_rejects_unsafe_folder_path(tmp_path):
    from app.services.code_review_service import safe_write_project_files

    dest = tmp_path / "tree"
    with pytest.raises(ValueError, match="Unsafe"):
        safe_write_project_files([("../evil.txt", b"bad")], dest, max_total_mb=10)
