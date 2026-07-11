"""Async database session factory."""

from collections.abc import AsyncGenerator
from urllib.parse import parse_qs, urlparse, urlencode, urlunparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings

settings = get_settings()


def _asyncpg_connect_args(database_url: str) -> dict:
    """Build asyncpg connect_args; Neon/cloud Postgres requires SSL."""
    connect_args: dict = {"timeout": 5}
    parsed = urlparse(database_url)
    query = parse_qs(parsed.query)

    ssl_mode = (query.get("ssl") or query.get("sslmode") or [None])[0]
    if ssl_mode in ("require", "verify-full", "verify-ca", "true", "1"):
        connect_args["ssl"] = True
    elif parsed.hostname and parsed.hostname.endswith(".neon.tech"):
        connect_args["ssl"] = True

    return connect_args


def _strip_ssl_query_params(database_url: str) -> str:
    """Remove ssl/sslmode from URL — asyncpg expects SSL via connect_args."""
    parsed = urlparse(database_url)
    query = parse_qs(parsed.query)
    for key in ("ssl", "sslmode"):
        query.pop(key, None)
    clean_query = urlencode({key: values[0] for key, values in query.items()})
    return urlunparse(parsed._replace(query=clean_query))


engine = create_async_engine(
    _strip_ssl_query_params(settings.database_url),
    echo=settings.debug,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    connect_args=_asyncpg_connect_args(settings.database_url),
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
