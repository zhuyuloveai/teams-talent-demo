"""Storage backend package: a unified data access interface; database / file backend chosen by config."""
from __future__ import annotations

from config import STORAGE_BACKEND

from .base import StorageBackend, TraceData
from .database_backend import DatabaseBackend
from .file_backend import FileBackend


def create_storage_backend(*args, **kwargs) -> StorageBackend:
    """Create the backend instance according to STORAGE_BACKEND.

    - database: needs an AsyncSession (passed in by route dependency injection)
    - file    : no connection needed; reads the DATA_FILE directory directly
    """
    if STORAGE_BACKEND == "database":
        return DatabaseBackend(*args, **kwargs)
    if STORAGE_BACKEND == "file":
        return FileBackend()
    raise RuntimeError(f"Unknown storage backend: {STORAGE_BACKEND!r}")


__all__ = [
    "StorageBackend",
    "TraceData",
    "DatabaseBackend",
    "FileBackend",
    "create_storage_backend",
]
