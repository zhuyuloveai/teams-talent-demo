"""Database access layer: SQLAlchemy async engine + Session.

The connection URL comes from config.DATABASE_URL (.env / environment variables); nothing is hard-coded.
Changing the URL switches between PostgreSQL / SQLite.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from config import DATABASE_URL

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def init_engine() -> None:
    """Create the async engine and session factory from DATABASE_URL (idempotent)."""
    global _engine, _session_factory
    if _engine is not None:
        return
    _engine = create_async_engine(DATABASE_URL, pool_size=10, max_overflow=5)
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)


async def close_engine() -> None:
    """Release the connection pool when the app shuts down."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        raise RuntimeError("database engine not initialized")
    return _session_factory
