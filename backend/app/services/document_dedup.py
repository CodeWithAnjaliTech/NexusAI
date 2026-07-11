"""Detect and merge duplicate document uploads."""

import hashlib
import json
from pathlib import Path
from uuid import UUID

import aiofiles
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.db.models.document import Document
from app.services.document_indexing import clear_document_embeddings, index_document


def content_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _parse_metadata(document: Document) -> dict:
    try:
        return json.loads(document.metadata_json or "{}")
    except json.JSONDecodeError:
        return {}


def _document_hash(document: Document) -> str | None:
    return _parse_metadata(document).get("content_hash")


def _matches_duplicate(
    document: Document,
    *,
    filename: str,
    file_hash: str,
    file_size: int,
) -> bool:
    existing_hash = _document_hash(document)
    if existing_hash and existing_hash == file_hash:
        return True
    return document.filename == filename and document.file_size == file_size


async def find_duplicate_document(
    db: AsyncSession,
    *,
    user_id: UUID,
    project_id: UUID | None,
    filename: str,
    file_hash: str,
    file_size: int,
) -> Document | None:
    query = select(Document).where(Document.user_id == user_id)
    if project_id:
        query = query.where(Document.project_id == project_id)
    else:
        query = query.where(Document.project_id.is_(None))

    result = await db.execute(query.order_by(Document.created_at.desc()))
    for document in result.scalars().all():
        if _matches_duplicate(
            document,
            filename=filename,
            file_hash=file_hash,
            file_size=file_size,
        ):
            return document
    return None


async def _delete_document_record(db: AsyncSession, document: Document) -> None:
    await clear_document_embeddings(db, document)
    file_path = Path(document.file_path)
    if file_path.is_file():
        file_path.unlink(missing_ok=True)
    await db.delete(document)


async def remove_other_duplicates(
    db: AsyncSession,
    *,
    user_id: UUID,
    project_id: UUID | None,
    keep_id: UUID,
    filename: str,
    file_hash: str,
    file_size: int,
) -> int:
    """Remove duplicate rows for the same file, keeping the canonical document."""
    query = select(Document).where(Document.user_id == user_id, Document.id != keep_id)
    if project_id:
        query = query.where(Document.project_id == project_id)
    else:
        query = query.where(Document.project_id.is_(None))

    result = await db.execute(query)
    removed = 0
    for document in result.scalars().all():
        if not _matches_duplicate(
            document,
            filename=filename,
            file_hash=file_hash,
            file_size=file_size,
        ):
            continue
        await _delete_document_record(db, document)
        removed += 1
        logger.info("Removed duplicate document %s (%s)", document.id, document.filename)
    return removed


async def upsert_duplicate_upload(
    db: AsyncSession,
    document: Document,
    *,
    content: bytes,
    file_hash: str,
    mime: str,
) -> Document:
    """Replace file contents for an existing document and re-index it."""
    file_path = Path(document.file_path)
    file_path.parent.mkdir(parents=True, exist_ok=True)

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    metadata = _parse_metadata(document)
    metadata["content_hash"] = file_hash
    document.metadata_json = json.dumps(metadata)
    document.mime_type = mime
    document.file_size = len(content)
    document.status = "processing"
    await db.flush()

    await clear_document_embeddings(db, document)
    await index_document(db, document)
    return document


def dedupe_document_list(documents: list[Document]) -> list[Document]:
    """Keep one entry per unique file (hash, else filename+size)."""
    seen: set[str] = set()
    unique: list[Document] = []
    for document in documents:
        file_hash = _document_hash(document)
        key = file_hash or f"{document.filename}:{document.file_size}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(document)
    return unique


async def consolidate_duplicate_documents(
    db: AsyncSession,
    documents: list[Document],
) -> list[Document]:
    """Remove duplicate rows from the database, keeping the newest copy."""
    seen: set[str] = set()
    kept: list[Document] = []
    for document in documents:
        file_hash = _document_hash(document)
        key = file_hash or f"{document.filename}:{document.file_size}"
        if key in seen:
            await _delete_document_record(db, document)
            logger.info("Consolidated duplicate document %s (%s)", document.id, document.filename)
            continue
        seen.add(key)
        kept.append(document)
    return kept
