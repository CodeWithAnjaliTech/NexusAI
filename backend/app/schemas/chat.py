"""Pydantic schemas for chat endpoints."""

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class IntentType(str, Enum):
    CODING = "coding"
    BLUEPRINT = "blueprint"
    DOCUMENTATION = "documentation"
    RESEARCH = "research"
    GENERAL = "general"


class AgentKey(str, Enum):
    CODE_SANDBOX = "code_sandbox"
    BLUEPRINT = "blueprint"
    DOCUMENTATION = "documentation"
    RESEARCH = "research"
    GENERAL = "general"


INTENT_TO_AGENT: dict[IntentType, AgentKey] = {
    IntentType.CODING: AgentKey.CODE_SANDBOX,
    IntentType.BLUEPRINT: AgentKey.BLUEPRINT,
    IntentType.DOCUMENTATION: AgentKey.DOCUMENTATION,
    IntentType.RESEARCH: AgentKey.RESEARCH,
    IntentType.GENERAL: AgentKey.GENERAL,
}


class ContextSource(str, Enum):
    AUTO = "auto"
    NONE = "none"
    GITHUB = "github"
    DOCUMENT = "document"
    BOTH = "both"


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=32000)
    session_id: UUID | None = None
    user_id: UUID | None = None
    stream: bool = True
    document_id: UUID | None = Field(default=None, description="Scope RAG to one document")
    project_id: UUID | None = None
    context_source: ContextSource = Field(
        default=ContextSource.AUTO,
        description="Explicit context: none, github, document, both, or auto (legacy keyword triggers)",
    )
    force_agent: AgentKey | None = Field(
        default=None,
        description="Skip auto-routing and use this agent directly",
    )
    custom_agent_id: UUID | None = Field(default=None, description="Use a user-defined custom agent")


class Citation(BaseModel):
    id: str
    source: str
    content: str
    score: float | None = None
    chunk_index: int | None = None
    document_id: str | None = None


class ChatResponse(BaseModel):
    session_id: UUID
    message_id: UUID
    content: str
    agent: AgentKey
    intent: IntentType
    graph_events: list[dict[str, Any]] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    duration_ms: int = 0


class StreamEvent(BaseModel):
    event: str
    data: dict[str, Any]
