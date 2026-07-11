"""Agent listing API routes."""

import json
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import seed_agents
from app.db.models.agent import Agent
from app.db.session import get_db
from app.schemas.agents import AgentResponse, AgentStatusResponse

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentResponse])
async def list_agents(db: AsyncSession = Depends(get_db)) -> list[AgentResponse]:
    await seed_agents(db)
    result = await db.execute(select(Agent).where(Agent.status == "active"))
    agents = result.scalars().all()

    return [
        AgentResponse(
            id=a.id,
            agent_key=a.agent_key,
            name=a.name,
            description=a.description,
            capabilities=json.loads(a.capabilities or "[]"),
            status=a.status,
        )
        for a in agents
    ]


@router.get("/status", response_model=list[AgentStatusResponse])
async def agent_status(db: AsyncSession = Depends(get_db)) -> list[AgentStatusResponse]:
    await seed_agents(db)
    result = await db.execute(select(Agent))
    agents = result.scalars().all()

    return [
        AgentStatusResponse(
            agent_key=a.agent_key,
            name=a.name,
            status=a.status,
            last_active=a.updated_at,
        )
        for a in agents
    ]
