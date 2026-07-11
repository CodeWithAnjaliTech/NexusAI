"""Pydantic schemas for memory endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class MemorySearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=8000)
    user_id: UUID | None = None
    project_id: UUID | None = None
    limit: int = Field(default=5, ge=1, le=50)


class MemorySearchResult(BaseModel):
    id: str
    content: str
    score: float
    metadata: dict
    source: str = "chromadb"


class MemorySearchResponse(BaseModel):
    query: str
    results: list[MemorySearchResult]
    total: int


class MemoryEntryResponse(BaseModel):
    id: UUID
    memory_type: str
    key: str
    value: str
    created_at: datetime
    session_id: UUID | None = None
    agent_key: str | None = None
    intent: str | None = None

    model_config = {"from_attributes": True}


class ConversationTurnResponse(BaseModel):
    turn_id: str
    session_id: UUID | None = None
    session_title: str | None = None
    user_message: str
    assistant_message: str | None = None
    agent_key: str | None = None
    intent: str | None = None
    created_at: datetime
    user_entry_id: UUID | None = None
    assistant_entry_id: UUID | None = None
