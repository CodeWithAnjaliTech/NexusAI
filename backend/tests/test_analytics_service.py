"""Analytics service resilience when Redis is unavailable."""

import asyncio
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.analytics_service import AnalyticsService


@pytest.mark.asyncio
async def test_get_summary_without_redis():
    service = AnalyticsService()

    class FakeResult:
        def all(self):
            return []

        def one(self):
            row = MagicMock()
            row.runs = 0
            row.successes = 0
            row.failures = 0
            return row

    fake_db = AsyncMock()
    fake_db.execute = AsyncMock(return_value=FakeResult())

    with patch.object(
        service,
        "_safe_redis_mget",
        new=AsyncMock(side_effect=lambda keys: {key: 0 for key in keys}),
    ):
        summary = await service.get_summary(fake_db)

    assert summary["total_requests_today"] == 0
    assert summary["success_rate_today"] == 0.0
    assert len(summary["daily_trend"]) == 7


@pytest.mark.asyncio
async def test_get_summary_falls_back_to_postgres_when_redis_empty():
    service = AnalyticsService()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    class AgentRows:
        def all(self):
            return []

    class DailyRows:
        def all(self):
            row = MagicMock()
            row.day = date.fromisoformat(today)
            row.requests = 3
            row.successes = 2
            row.failures = 1
            return [row]

    class SandboxRow:
        def one(self):
            row = MagicMock()
            row.runs = 0
            row.successes = 0
            row.failures = 0
            return row

    fake_db = AsyncMock()
    fake_db.execute = AsyncMock(
        side_effect=[
            MagicMock(all=AgentRows().all),
            DailyRows(),
            SandboxRow(),
        ]
    )

    with patch.object(
        service,
        "_safe_redis_mget",
        new=AsyncMock(side_effect=lambda keys: {key: 0 for key in keys}),
    ):
        summary = await service.get_summary(fake_db)

    assert summary["total_requests_today"] == 3
    assert summary["successes_today"] == 2
    assert summary["failures_today"] == 1
    assert summary["success_rate_today"] == pytest.approx(66.7, abs=0.1)
    assert summary["daily_trend"][-1]["requests"] == 3


@pytest.mark.asyncio
async def test_record_agent_run_without_redis():
    service = AnalyticsService()
    fake_db = AsyncMock()

    with patch.object(service, "_safe_redis_incr", new=AsyncMock()) as incr_mock:
        await service.record_agent_run(
            fake_db,
            agent_key="general",
            intent="general",
            duration_ms=100,
            success=True,
            user_id=uuid4(),
        )

    incr_mock.assert_awaited_once()
    fake_db.add.assert_called_once()
