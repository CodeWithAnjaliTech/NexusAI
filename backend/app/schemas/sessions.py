"""Pydantic schemas for session endpoints."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class MessageAttachment(BaseModel):
    id: str
    filename: str
    mime_type: str
    file_size: int = 0
    status: str = "stored"


class SessionCreate(BaseModel):
    title: str = Field(default="New Conversation", max_length=500)
    user_id: UUID | None = None
    project_id: UUID | None = None


class SessionUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    project_id: UUID | None = None


class SessionResponse(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    status: str
    project_id: UUID | None = None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    agent_id: str | None
    intent: str | None
    created_at: datetime
    attachments: list[MessageAttachment] = Field(default_factory=list)
    citations: list[dict[str, Any]] = Field(default_factory=list)

    model_config = {"from_attributes": True}
