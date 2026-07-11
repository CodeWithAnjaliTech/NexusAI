"""Document upload deduplication tests."""

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.db.models.document import Document
from app.services.document_dedup import (
    consolidate_duplicate_documents,
    content_hash,
    dedupe_document_list,
    find_duplicate_document,
)


def _doc(filename: str, size: int, file_hash: str | None = None) -> Document:
    doc = Document(
        id=uuid4(),
        user_id=uuid4(),
        filename=filename,
        file_path=f"/tmp/{filename}",
        mime_type="application/pdf",
        file_size=size,
        status="stored",
    )
    if file_hash:
        doc.metadata_json = json.dumps({"content_hash": file_hash})
    return doc


def test_content_hash_stable():
    data = b"same pdf bytes"
    assert content_hash(data) == content_hash(data)
    assert content_hash(data) != content_hash(b"other")


def test_dedupe_document_list_by_filename_and_size():
    docs = [
        _doc("Rewards.pdf", 1000),
        _doc("Rewards.pdf", 1000),
        _doc("Other.pdf", 500),
    ]
    unique = dedupe_document_list(docs)
    assert len(unique) == 2
    assert unique[0].filename == "Rewards.pdf"
    assert unique[1].filename == "Other.pdf"


def test_dedupe_document_list_by_content_hash():
    docs = [
        _doc("a.pdf", 1000, "hash1"),
        _doc("b.pdf", 2000, "hash1"),
    ]
    unique = dedupe_document_list(docs)
    assert len(unique) == 1


@pytest.mark.asyncio
async def test_find_duplicate_document_by_hash():
    user_id = uuid4()
    file_hash = content_hash(b"pdf-content")
    existing = _doc("Rewards.pdf", 100, file_hash)
    existing.user_id = user_id

    other = _doc("Other.pdf", 50)
    other.user_id = user_id

    fake_db = AsyncMock()
    fake_result = MagicMock()
    fake_result.scalars.return_value.all.return_value = [existing, other]
    fake_db.execute = AsyncMock(return_value=fake_result)

    found = await find_duplicate_document(
        fake_db,
        user_id=user_id,
        project_id=None,
        filename="Rewards.pdf",
        file_hash=file_hash,
        file_size=999,
    )
    assert found is existing


@pytest.mark.asyncio
async def test_consolidate_duplicate_documents_deletes_extras():
    keep = _doc("Rewards.pdf", 1000)
    duplicate = _doc("Rewards.pdf", 1000)

    fake_db = AsyncMock()
    with patch(
        "app.services.document_dedup._delete_document_record",
        new=AsyncMock(),
    ) as delete_mock:
        kept = await consolidate_duplicate_documents(fake_db, [keep, duplicate])

    assert kept == [keep]
    delete_mock.assert_awaited_once_with(fake_db, duplicate)
