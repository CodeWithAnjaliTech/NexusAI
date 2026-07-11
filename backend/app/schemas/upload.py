"""Pydantic schemas for upload endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class UploadResponse(BaseModel):
    id: UUID
    filename: str
    mime_type: str
    file_size: int
    status: str
    chunk_count: int
    created_at: datetime

    model_config = {"from_attributes": True}
