"""Redis-backed rate limiting middleware."""

import asyncio
import time
from collections.abc import Callable

import redis.asyncio as aioredis
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.config import get_settings

_REDIS_TIMEOUT_SECONDS = 2.0


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Limit requests per IP for API routes."""

    def __init__(self, app, redis_url: str, max_requests: int, window_seconds: int):
        super().__init__(app)
        self._redis_url = redis_url
        self._max = max_requests
        self._window = window_seconds
        self._redis: aioredis.Redis | None = None

    async def _client(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(
                self._redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
        return self._redis

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        key = f"ratelimit:{client_ip}:{int(time.time()) // self._window}"

        try:
            redis = await self._client()
            count = await asyncio.wait_for(redis.incr(key), timeout=_REDIS_TIMEOUT_SECONDS)
            if count == 1:
                await asyncio.wait_for(redis.expire(key, self._window), timeout=_REDIS_TIMEOUT_SECONDS)
            if count > self._max:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded. Try again shortly."},
                )
        except Exception:
            pass

        return await call_next(request)
