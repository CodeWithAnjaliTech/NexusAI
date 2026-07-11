"""Message metadata helpers."""

import json
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.db.models.document import Document
from app.services.message_metadata import (
    attachments_from_metadata,
    build_user_message_metadata,
    citations_from_metadata,
)


@pytest.mark.asyncio
async def test_build_user_message_metadata_includes_attachment():
    doc_id = uuid4()
    document = Document(
        id=doc_id,
        user_id=uuid4(),
        filename="Rewards.pdf",
        file_path="/tmp/x.pdf",
        mime_type="application/pdf",
        file_size=1234,
        status="indexed",
    )
    fake_db = AsyncMock()
    fake_result = MagicMock()
    fake_result.scalar_one_or_none.return_value = document
    fake_db.execute = AsyncMock(return_value=fake_result)

    raw = await build_user_message_metadata(fake_db, document_id=doc_id)
    meta = json.loads(raw)
    assert meta["document_id"] == str(doc_id)
    assert meta["attachments"][0]["filename"] == "Rewards.pdf"
    assert meta["attachments"][0]["status"] == "indexed"


def test_attachments_and_citations_from_metadata():
    raw = json.dumps(
        {
            "attachments": [
                {
                    "id": "abc",
                    "filename": "doc.pdf",
                    "mime_type": "application/pdf",
                    "file_size": 10,
                    "status": "indexed",
                }
            ],
            "citations": [{"id": "[1]", "source": "doc.pdf", "content": "hello"}],
        }
    )
    assert len(attachments_from_metadata(raw)) == 1
    assert len(citations_from_metadata(raw)) == 1
