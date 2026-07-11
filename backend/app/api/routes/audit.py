"""Audit log API routes."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.db.models.audit_log import AuditLog
from app.db.models.user import User
from app.db.session import get_db

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditLogResponse(BaseModel):
    id: str
    action: str
    resource_type: str
    resource_id: str | None
    created_at: str

    model_config = {"from_attributes": True}


@router.get("", response_model=list[AuditLogResponse])
async def list_audit_logs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
    limit: int = 50,
) -> list[AuditLogResponse]:
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.user_id == user.id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    logs = result.scalars().all()
    return [
        AuditLogResponse(
            id=str(l.id),
            action=l.action,
            resource_type=l.resource_type,
            resource_id=l.resource_id,
            created_at=l.created_at.isoformat(),
        )
        for l in logs
    ]
