"""Analytics API routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.analytics import AnalyticsSummaryResponse
from app.services.analytics_service import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary", response_model=AnalyticsSummaryResponse)
async def analytics_summary(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_auth),
) -> AnalyticsSummaryResponse:
    summary = await analytics_service.get_summary(db, organization_id=user.organization_id)
    return AnalyticsSummaryResponse(**summary)
