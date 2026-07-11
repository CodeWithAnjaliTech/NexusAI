"""Pydantic schemas for agent endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AgentResponse(BaseModel):
    id: UUID
    agent_key: str
    name: str
    description: str
    capabilities: list[str]
    status: str

    model_config = {"from_attributes": True}


class AgentStatusResponse(BaseModel):
    agent_key: str
    name: str
    status: str
    last_active: datetime | None = None
