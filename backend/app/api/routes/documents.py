"""Document listing, preview, re-index, and file serving API routes."""

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.config import get_settings
from app.db.models.document import Document
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.upload import UploadResponse
from app.services.document_dedup import consolidate_duplicate_documents
from app.services.document_indexing import clear_document_embeddings, index_document, reindex_document
from app.services.file_processor import file_processor

router = APIRouter(prefix="/documents", tags=["documents"])
settings = get_settings()

INLINE_MIME_PREFIXES = ("image/", "application/pdf", "text/")


class DocumentPreviewText(BaseModel):
    document_id: UUID
    filename: str
    mime_type: str
    text_preview: str
    char_count: int


async def _get_user_document(
    db: AsyncSession, document_id: UUID, user: User
) -> Document:
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.user_id == user.id)
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


def _content_disposition(mime_type: str, filename: str) -> str:
    """Use inline for previewable types so browsers don't force download."""
    if mime_type.startswith(INLINE_MIME_PREFIXES) or filename.lower().endswith(".pdf"):
        disposition = "inline"
    else:
        disposition = "attachment"
    return disposition


@router.get("", response_model=list[UploadResponse])
async def list_documents(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
    project_id: UUID | None = None,
) -> list[UploadResponse]:
    query = select(Document).where(Document.user_id == user.id)
    if project_id:
        query = query.where(Document.project_id == project_id)
    query = query.order_by(Document.created_at.desc())
    result = await db.execute(query)
    docs = await consolidate_duplicate_documents(db, list(result.scalars().all()))
    return [UploadResponse.model_validate(d) for d in docs]


@router.get("/{document_id}/file")
async def get_document_file(
    document_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> FileResponse:
    document = await _get_user_document(db, document_id, user)
    file_path = Path(document.file_path)
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found on disk")

    disposition = _content_disposition(document.mime_type, document.filename)
    return FileResponse(
        path=file_path,
        media_type=document.mime_type,
        filename=document.filename,
        content_disposition_type=disposition,
    )


@router.get("/{document_id}/preview-text", response_model=DocumentPreviewText)
async def get_document_preview_text(
    document_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> DocumentPreviewText:
    """Return extracted text for DOCX, TXT, and other non-PDF previews."""
    document = await _get_user_document(db, document_id, user)
    file_path = Path(document.file_path)
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found on disk")

    text = file_processor.extract_text(file_path, document.mime_type)
    preview = text[:4000].strip() if text else "[No extractable text in this file]"
    return DocumentPreviewText(
        document_id=document.id,
        filename=document.filename,
        mime_type=document.mime_type,
        text_preview=preview,
        char_count=len(text),
    )


@router.post("/{document_id}/reindex", response_model=UploadResponse)
async def reindex_document_route(
    document_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> UploadResponse:
    document = await _get_user_document(db, document_id, user)
    try:
        await reindex_document(db, document)
    except Exception as exc:
        document.status = "failed"
        await db.flush()
        raise HTTPException(status_code=500, detail=f"Re-index failed: {exc}") from exc
    return UploadResponse.model_validate(document)


@router.delete("/{document_id}")
async def delete_document(
    document_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> dict:
    document = await _get_user_document(db, document_id, user)

    await clear_document_embeddings(db, document)

    file_path = Path(document.file_path)
    if file_path.is_file():
        file_path.unlink(missing_ok=True)

    await db.delete(document)
    return {"deleted": str(document_id)}
