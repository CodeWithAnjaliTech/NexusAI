"""Custom agents API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.db.models.custom_agent import CustomAgent
from app.db.models.user import User
from app.db.session import get_db
from app.services.audit_service import audit_service

router = APIRouter(prefix="/custom-agents", tags=["custom-agents"])


class CustomAgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    system_prompt: str = Field(..., min_length=10, max_length=8000)
    base_agent_key: str = Field(default="general")


class CustomAgentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    system_prompt: str | None = Field(default=None, min_length=10, max_length=8000)
    base_agent_key: str | None = None


class CustomAgentResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    system_prompt: str
    base_agent_key: str
    status: str

    model_config = {"from_attributes": True}


@router.get("", response_model=list[CustomAgentResponse])
async def list_custom_agents(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> list[CustomAgentResponse]:
    result = await db.execute(
        select(CustomAgent)
        .where(CustomAgent.user_id == user.id, CustomAgent.status == "active")
        .order_by(CustomAgent.updated_at.desc())
    )
    return [CustomAgentResponse.model_validate(a) for a in result.scalars().all()]


@router.post("", response_model=CustomAgentResponse)
async def create_custom_agent(
    body: CustomAgentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> CustomAgentResponse:
    agent = CustomAgent(
        user_id=user.id,
        name=body.name,
        description=body.description,
        system_prompt=body.system_prompt,
        base_agent_key=body.base_agent_key,
    )
    db.add(agent)
    await db.flush()
    await audit_service.log(
        db, "create", "custom_agent", str(agent.id), user.id, user.organization_id
    )
    return CustomAgentResponse.model_validate(agent)


@router.patch("/{agent_id}", response_model=CustomAgentResponse)
async def update_custom_agent(
    agent_id: UUID,
    body: CustomAgentUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> CustomAgentResponse:
    result = await db.execute(
        select(CustomAgent).where(
            CustomAgent.id == agent_id,
            CustomAgent.user_id == user.id,
            CustomAgent.status == "active",
        )
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Custom agent not found")

    if body.name is not None:
        agent.name = body.name
    if body.description is not None:
        agent.description = body.description
    if body.system_prompt is not None:
        agent.system_prompt = body.system_prompt
    if body.base_agent_key is not None:
        agent.base_agent_key = body.base_agent_key

    await audit_service.log(
        db, "update", "custom_agent", str(agent.id), user.id, user.organization_id
    )
    return CustomAgentResponse.model_validate(agent)


@router.delete("/{agent_id}")
async def delete_custom_agent(
    agent_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> dict:
    result = await db.execute(
        select(CustomAgent).where(CustomAgent.id == agent_id, CustomAgent.user_id == user.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Custom agent not found")
    agent.status = "archived"
    return {"deleted": str(agent_id)}
