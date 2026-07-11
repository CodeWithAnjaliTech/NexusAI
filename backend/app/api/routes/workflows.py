"""Workflow API — reusable agent + tool pipelines."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.db.models.user import User
from app.db.models.workflow import Workflow
from app.db.session import get_db

router = APIRouter(prefix="/workflows", tags=["workflows"])


class WorkflowStep(BaseModel):
    type: Literal["input", "agent", "tool", "output"]
    name: str
    config: dict = Field(default_factory=dict)


class WorkflowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    steps: list[WorkflowStep] = Field(default_factory=list)


class WorkflowResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    steps: list[dict]
    status: str

    model_config = {"from_attributes": True}


@router.get("", response_model=list[WorkflowResponse])
async def list_workflows(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> list[WorkflowResponse]:
    result = await db.execute(
        select(Workflow).where(Workflow.user_id == user.id).order_by(Workflow.updated_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=WorkflowResponse)
async def create_workflow(
    body: WorkflowCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> WorkflowResponse:
    workflow = Workflow(
        user_id=user.id,
        name=body.name,
        description=body.description,
        steps=[step.model_dump() for step in body.steps],
    )
    db.add(workflow)
    await db.flush()
    return workflow


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> WorkflowResponse:
    result = await db.execute(
        select(Workflow).where(Workflow.id == workflow_id, Workflow.user_id == user.id)
    )
    workflow = result.scalar_one_or_none()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow
