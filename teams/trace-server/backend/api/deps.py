"""FastAPI dependency injection: provides the storage backend according to STORAGE_BACKEND."""
from __future__ import annotations

from typing import AsyncIterator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from config import STORAGE_BACKEND
from db.backends.base import StorageBackend
from db.backends.database_backend import DatabaseBackend
from db.backends.file_backend import FileBackend
from db.connection import get_session_factory


async def get_session() -> AsyncIterator[AsyncSession | None]:
    """database backend: one session per request (closed automatically by FastAPI).

    file backend: no database connection needed; yields None directly (the engine is not initialized).
    """
    if STORAGE_BACKEND != "database":
        yield None
        return
    factory = get_session_factory()
    async with factory() as session:
        yield session


def get_storage_backend(
    session: AsyncSession | None = Depends(get_session),
) -> StorageBackend:
    """Return the configured storage backend instance (the file backend is a per-process singleton)."""
    if STORAGE_BACKEND == "database":
        if session is None:  # Defensive: database mode must have a session
            raise RuntimeError("database storage backend has no database session")
        return DatabaseBackend(session)
    if _file_backend is None:
        raise RuntimeError("file storage backend is not initialized")
    return _file_backend


# Module-level file backend singleton (lazily initialized, created only in file mode)
_file_backend: FileBackend | None = (
    FileBackend() if STORAGE_BACKEND == "file" else None
)
