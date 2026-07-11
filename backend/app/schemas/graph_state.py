"""Pydantic schemas for graph state visualization."""

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class GraphNode(BaseModel):
    id: str
    type: str
    label: str
    status: str = "completed"
    metadata: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str | None = None


class GraphStateResponse(BaseModel):
    session_id: UUID
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    current_node: str | None = None
