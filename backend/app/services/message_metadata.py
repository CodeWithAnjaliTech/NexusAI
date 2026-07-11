"""Helpers for serializing chat message metadata (attachments, citations)."""

import json
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.document import Document


def parse_metadata(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


async def build_user_message_metadata(
    db: AsyncSession,
    *,
    document_id: UUID | None,
) -> str:
    """Persist attachment info on user messages for session reload."""
    if not document_id:
        return "{}"

    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()
    if not document:
        return json.dumps({"document_id": str(document_id)})

    return json.dumps(
        {
            "document_id": str(document.id),
            "attachments": [
                {
                    "id": str(document.id),
                    "filename": document.filename,
                    "mime_type": document.mime_type,
                    "file_size": document.file_size,
                    "status": document.status,
                }
            ],
        }
    )


def attachments_from_metadata(raw: str | None) -> list[dict]:
    meta = parse_metadata(raw)
    if meta.get("attachments"):
        return list(meta["attachments"])
    doc_id = meta.get("document_id")
    if doc_id:
        return [
            {
                "id": doc_id,
                "filename": meta.get("filename", "document"),
                "mime_type": meta.get("mime_type", "application/octet-stream"),
                "file_size": meta.get("file_size", 0),
                "status": meta.get("status", "stored"),
            }
        ]
    return []


def citations_from_metadata(raw: str | None) -> list[dict]:
    return list(parse_metadata(raw).get("citations") or [])
