"""File upload API routes."""

import json
import uuid
from pathlib import Path
from uuid import UUID

import aiofiles
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.config import get_settings
from app.db.models.document import Document
from app.db.models.project import Project
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.upload import UploadResponse
from app.services.document_dedup import (
    content_hash,
    find_duplicate_document,
    remove_other_duplicates,
    upsert_duplicate_upload,
)
from app.services.document_indexing import index_document

router = APIRouter(prefix="/upload", tags=["upload"])
settings = get_settings()

UPLOAD_LIMIT_PER_HOUR = 30


async def _check_upload_rate_limit(user_id: UUID) -> None:
    try:
        client = aioredis.from_url(settings.redis_url, decode_responses=True)
        key = f"upload:rate:{user_id}"
        count = await client.incr(key)
        if count == 1:
            await client.expire(key, 3600)
        if count > UPLOAD_LIMIT_PER_HOUR:
            raise HTTPException(
                status_code=429,
                detail=f"Upload limit reached ({UPLOAD_LIMIT_PER_HOUR}/hour). Try again later.",
            )
    except HTTPException:
        raise
    except Exception:
        pass


@router.post("", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    project_id: UUID | None = Form(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> UploadResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    await _check_upload_rate_limit(user.id)

    content = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_upload_size_mb}MB limit")

    if project_id:
        proj_result = await db.execute(
            select(Project).where(Project.id == project_id, Project.user_id == user.id)
        )
        if not proj_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Project not found")

    file_hash = content_hash(content)
    existing = await find_duplicate_document(
        db,
        user_id=user.id,
        project_id=project_id,
        filename=file.filename,
        file_hash=file_hash,
        file_size=len(content),
    )
    if existing:
        document = await upsert_duplicate_upload(
            db,
            existing,
            content=content,
            file_hash=file_hash,
            mime=file.content_type or "application/octet-stream",
        )
        await remove_other_duplicates(
            db,
            user_id=user.id,
            project_id=project_id,
            keep_id=document.id,
            filename=file.filename,
            file_hash=file_hash,
            file_size=len(content),
        )
        await db.flush()
        return UploadResponse(
            id=document.id,
            filename=document.filename,
            mime_type=document.mime_type,
            file_size=document.file_size,
            status=document.status,
            chunk_count=document.chunk_count,
            created_at=document.created_at,
        )

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    doc_id = uuid.uuid4()
    safe_name = f"{doc_id}_{file.filename}"
    file_path = upload_dir / safe_name

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    mime = file.content_type or "application/octet-stream"
    document = Document(
        id=doc_id,
        user_id=user.id,
        project_id=project_id,
        filename=file.filename,
        file_path=str(file_path),
        mime_type=mime,
        file_size=len(content),
        status="processing",
        metadata_json=json.dumps({"content_hash": file_hash}),
    )
    db.add(document)
    await db.flush()

    try:
        await index_document(db, document)
    except Exception as exc:
        document.status = "failed"
        raise HTTPException(status_code=500, detail=f"Indexing failed: {exc}") from exc

    return UploadResponse(
        id=document.id,
        filename=document.filename,
        mime_type=document.mime_type,
        file_size=document.file_size,
        status=document.status,
        chunk_count=document.chunk_count,
        created_at=document.created_at,
    )
