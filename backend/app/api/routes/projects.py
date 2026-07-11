"""Projects API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.db.models.project import Project
from app.db.models.user import User
from app.db.session import get_db
from app.services.audit_service import audit_service

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    description: str | None

    model_config = {"from_attributes": True}


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> list[ProjectResponse]:
    result = await db.execute(
        select(Project).where(Project.user_id == user.id).order_by(Project.updated_at.desc())
    )
    return [ProjectResponse.model_validate(p) for p in result.scalars().all()]


@router.post("", response_model=ProjectResponse)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> ProjectResponse:
    project = Project(
        user_id=user.id,
        organization_id=user.organization_id,
        name=body.name,
        description=body.description,
    )
    db.add(project)
    await db.flush()
    await audit_service.log(
        db, "create", "project", str(project.id), user.id, user.organization_id
    )
    return ProjectResponse.model_validate(project)


@router.delete("/{project_id}")
async def delete_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> dict:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.delete(project)
    await audit_service.log(
        db, "delete", "project", str(project_id), user.id, user.organization_id
    )
    return {"deleted": str(project_id)}
