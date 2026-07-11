"""Analytics event recording and aggregation."""

import asyncio
from datetime import datetime, timedelta, timezone
from uuid import UUID

import redis.asyncio as aioredis
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.logging import logger
from app.db.models.agent_metric import AgentMetric

_REDIS_TIMEOUT_SECONDS = 2.0


class AnalyticsService:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._redis: aioredis.Redis | None = None
        self._redis_available: bool | None = None

    async def _redis_client(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(
                self._settings.redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
        return self._redis

    async def _ensure_redis(self) -> bool:
        if self._redis_available is True:
            return True
        if self._redis_available is False:
            return False
        try:
            redis = await self._redis_client()
            await asyncio.wait_for(redis.ping(), timeout=_REDIS_TIMEOUT_SECONDS)
            self._redis_available = True
            return True
        except Exception as exc:
            logger.warning("Redis analytics unavailable: %s", exc)
            self._redis_available = False
            return False

    async def _safe_redis_mget(self, keys: list[str]) -> dict[str, int]:
        if not keys:
            return {}
        if not await self._ensure_redis():
            return {key: 0 for key in keys}
        try:
            redis = await self._redis_client()
            values = await asyncio.wait_for(redis.mget(keys), timeout=_REDIS_TIMEOUT_SECONDS)
            return {key: int(value or 0) for key, value in zip(keys, values)}
        except Exception as exc:
            logger.warning("Redis analytics batch read failed: %s", exc)
            self._redis_available = False
            return {key: 0 for key in keys}

    async def _safe_redis_incr(self, keys: list[str], success_key: str | None = None) -> None:
        if not await self._ensure_redis():
            return
        try:
            redis = await self._redis_client()
            pipe = redis.pipeline()
            for key in keys:
                pipe.incr(key)
            if success_key:
                pipe.incr(success_key)
            await asyncio.wait_for(pipe.execute(), timeout=_REDIS_TIMEOUT_SECONDS)
        except Exception as exc:
            logger.warning("Redis analytics write unavailable: %s", exc)
            self._redis_available = False

    async def _get_daily_metrics_from_db(
        self,
        db: AsyncSession,
        trend_dates: list[str],
        organization_id: UUID | None = None,
    ) -> dict[str, dict[str, int]]:
        """Aggregate agent run counts by UTC date from PostgreSQL."""
        if not trend_dates:
            return {}

        start = datetime.strptime(trend_dates[0], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        day_expr = func.date(AgentMetric.created_at)

        query = (
            select(
                day_expr.label("day"),
                func.count().label("requests"),
                func.sum(case((AgentMetric.success.is_(True), 1), else_=0)).label("successes"),
                func.sum(case((AgentMetric.success.is_(False), 1), else_=0)).label("failures"),
            )
            .where(AgentMetric.created_at >= start)
            .group_by(day_expr)
        )
        if organization_id:
            query = query.where(AgentMetric.organization_id == organization_id)

        result = await db.execute(query)
        by_date: dict[str, dict[str, int]] = {}
        for row in result.all():
            day_key = row.day.isoformat() if hasattr(row.day, "isoformat") else str(row.day)
            by_date[day_key] = {
                "requests": int(row.requests or 0),
                "successes": int(row.successes or 0),
                "failures": int(row.failures or 0),
            }

        return {
            d: by_date.get(
                d,
                {"requests": 0, "successes": 0, "failures": 0},
            )
            for d in trend_dates
        }

    def _merge_daily_counts(
        self,
        redis_counts: dict[str, int],
        db_metrics: dict[str, dict[str, int]],
        trend_dates: list[str],
        day: str,
    ) -> tuple[int, int, int, list[dict]]:
        """Prefer Redis when populated; fall back to PostgreSQL for missing data."""
        db_today = db_metrics.get(day, {"requests": 0, "successes": 0, "failures": 0})

        total_today = redis_counts.get(f"analytics:requests:{day}", 0)
        successes_today = redis_counts.get(f"analytics:success:{day}", 0)
        failures_today = redis_counts.get(f"analytics:failure:{day}", 0)

        if total_today == 0 and db_today["requests"] > 0:
            total_today = db_today["requests"]
            successes_today = db_today["successes"]
            failures_today = db_today["failures"]

        daily_trend = []
        for d in trend_dates:
            redis_requests = redis_counts.get(f"analytics:requests:{d}", 0)
            redis_successes = redis_counts.get(f"analytics:success:{d}", 0)
            redis_failures = redis_counts.get(f"analytics:failure:{d}", 0)
            db_day = db_metrics.get(d, {"requests": 0, "successes": 0, "failures": 0})

            if redis_requests == 0 and db_day["requests"] > 0:
                requests, successes, failures = (
                    db_day["requests"],
                    db_day["successes"],
                    db_day["failures"],
                )
            else:
                requests, successes, failures = redis_requests, redis_successes, redis_failures

            daily_trend.append(
                {
                    "date": d,
                    "requests": requests,
                    "successes": successes,
                    "failures": failures,
                }
            )

        return total_today, successes_today, failures_today, daily_trend

    async def record_agent_run(
        self,
        db: AsyncSession,
        *,
        agent_key: str,
        intent: str,
        duration_ms: int,
        success: bool,
        user_id: UUID | None = None,
        organization_id: UUID | None = None,
        session_id: UUID | None = None,
    ) -> None:
        db.add(
            AgentMetric(
                agent_key=agent_key,
                intent=intent,
                duration_ms=duration_ms,
                success=success,
                user_id=user_id,
                organization_id=organization_id,
                session_id=session_id,
            )
        )

        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        keys = [f"analytics:requests:{day}", f"analytics:agent:{agent_key}:{day}"]
        outcome_key = f"analytics:success:{day}" if success else f"analytics:failure:{day}"
        await self._safe_redis_incr(keys, success_key=outcome_key)

    async def _get_sandbox_metrics_from_db(
        self,
        db: AsyncSession,
        day: str,
        organization_id: UUID | None = None,
    ) -> dict[str, int]:
        start = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        query = (
            select(
                func.count().label("runs"),
                func.sum(case((AgentMetric.success.is_(True), 1), else_=0)).label("successes"),
                func.sum(case((AgentMetric.success.is_(False), 1), else_=0)).label("failures"),
            )
            .where(
                AgentMetric.agent_key == "sandbox",
                AgentMetric.created_at >= start,
                AgentMetric.created_at < end,
            )
        )
        if organization_id:
            query = query.where(AgentMetric.organization_id == organization_id)
        result = await db.execute(query)
        row = result.one()
        return {
            "runs": int(row.runs or 0),
            "successes": int(row.successes or 0),
            "failures": int(row.failures or 0),
        }

    async def record_sandbox_run(
        self,
        db: AsyncSession,
        *,
        success: bool,
        user_id: UUID | None = None,
        organization_id: UUID | None = None,
    ) -> None:
        db.add(
            AgentMetric(
                agent_key="sandbox",
                intent="sandbox",
                duration_ms=0,
                success=success,
                user_id=user_id,
                organization_id=organization_id,
            )
        )
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        keys = [f"analytics:sandbox:{day}"]
        outcome_key = f"analytics:sandbox_success:{day}" if success else f"analytics:sandbox_failure:{day}"
        await self._safe_redis_incr(keys, success_key=outcome_key)

    async def get_summary(self, db: AsyncSession, organization_id: UUID | None = None) -> dict:
        query = (
            select(
                AgentMetric.agent_key,
                func.count().label("count"),
                func.avg(AgentMetric.duration_ms).label("avg_ms"),
            )
            .where(AgentMetric.agent_key != "sandbox")
            .group_by(AgentMetric.agent_key)
        )
        if organization_id:
            query = query.where(AgentMetric.organization_id == organization_id)

        result = await db.execute(query)
        rows = result.all()

        now = datetime.now(timezone.utc)
        day = now.strftime("%Y-%m-%d")
        trend_dates = [(now - timedelta(days=offset)).strftime("%Y-%m-%d") for offset in range(6, -1, -1)]
        redis_keys = [
            f"analytics:requests:{day}",
            f"analytics:success:{day}",
            f"analytics:failure:{day}",
            f"analytics:sandbox:{day}",
            f"analytics:sandbox_success:{day}",
            f"analytics:sandbox_failure:{day}",
        ]
        for d in trend_dates:
            redis_keys.extend(
                [
                    f"analytics:requests:{d}",
                    f"analytics:success:{d}",
                    f"analytics:failure:{d}",
                ]
            )

        counts = await self._safe_redis_mget(redis_keys)
        db_metrics = await self._get_daily_metrics_from_db(db, trend_dates, organization_id)

        total_today, successes_today, failures_today, daily_trend = self._merge_daily_counts(
            counts, db_metrics, trend_dates, day
        )
        success_rate = round((successes_today / total_today) * 100, 1) if total_today else 0.0

        sandbox_runs = counts[f"analytics:sandbox:{day}"]
        sandbox_ok = counts[f"analytics:sandbox_success:{day}"]
        sandbox_fail = counts[f"analytics:sandbox_failure:{day}"]
        if sandbox_runs == 0:
            db_sandbox = await self._get_sandbox_metrics_from_db(db, day, organization_id)
            sandbox_runs = db_sandbox["runs"]
            sandbox_ok = db_sandbox["successes"]
            sandbox_fail = db_sandbox["failures"]

        return {
            "total_requests_today": total_today,
            "successes_today": successes_today,
            "failures_today": failures_today,
            "success_rate_today": success_rate,
            "agents": [
                {
                    "agent_key": row.agent_key,
                    "invocations": row.count,
                    "avg_duration_ms": round(float(row.avg_ms or 0), 1),
                }
                for row in rows
            ],
            "daily_trend": daily_trend,
            "sandbox": {
                "runs_today": sandbox_runs,
                "successes_today": sandbox_ok,
                "failures_today": sandbox_fail,
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "monthly_request_limit": None,
            "monthly_requests_used": total_today,
        }


analytics_service = AnalyticsService()
