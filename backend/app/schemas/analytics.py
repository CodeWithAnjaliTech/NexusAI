"""Analytics response schemas."""

from pydantic import BaseModel


class AgentMetricSummary(BaseModel):
    agent_key: str
    invocations: int
    avg_duration_ms: float


class DailyMetric(BaseModel):
    date: str
    requests: int
    successes: int
    failures: int


class SandboxMetricSummary(BaseModel):
    runs_today: int
    successes_today: int
    failures_today: int


class AnalyticsSummaryResponse(BaseModel):
    total_requests_today: int
    successes_today: int
    failures_today: int
    success_rate_today: float
    agents: list[AgentMetricSummary]
    daily_trend: list[DailyMetric]
    sandbox: SandboxMetricSummary
    generated_at: str
    monthly_request_limit: int | None = None
    monthly_requests_used: int | None = None
