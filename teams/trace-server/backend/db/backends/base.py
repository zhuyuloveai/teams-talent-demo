"""Storage backend abstraction: a unified "read trace data" interface.

Both the database and file backends implement these methods; routes depend only on this abstraction (Repository Pattern).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class TraceRow(dict):
    """One row of trace data (a plain dict, easy to serialize)."""


class TraceData:
    """Full data of one trace (including spans / observations)."""

    def __init__(
        self,
        trace: dict[str, Any],
        spans: list[dict[str, Any]],
        observations: list[dict[str, Any]],
    ):
        self.trace = trace
        self.spans = spans
        self.observations = observations


class SpanData:
    """Detail of a single span (including its observations)."""

    def __init__(
        self,
        span: dict[str, Any],
        observations: list[dict[str, Any]],
    ):
        self.span = span
        self.observations = observations


class StorageBackend(ABC):
    """Unified storage backend interface (currently read-only: query and display).

    Project management (projects CRUD / agents) is retired: project IDs come from the integrator/reporter.
    """

    @abstractmethod
    async def list_traces(
        self,
        project_id: str,
        page: int = 1,
        page_size: int = 20,
        agent_name: str | None = None,
        status: str | None = None,
        session_id: str | None = None,
        trace_id: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]: ...

    @abstractmethod
    async def get_trace_detail(
        self,
        project_id: str,
        trace_id: str,
        session_id: str | None = None,
    ) -> TraceData | None: ...

    @abstractmethod
    async def get_llm_request(
        self, project_id: str, event_id: str
    ) -> dict[str, Any] | None: ...

    async def get_span_detail(
        self,
        project_id: str,
        trace_id: str,
        span_id: str,
        session_id: str | None = None,
    ) -> SpanData | None:
        """Read one span detail by span_id (including its observations).

        Deliberately **not** marked `abstractmethod`: the file backend does not implement lazy loading yet (decision 2);
        if it were abstract, the module-level `FileBackend()` in deps.py would raise
        TypeError at import and file mode would not start. Returns None by default -> 404 in the route, no mode branch.
        """
        return None

    async def export_trace_jsonl(
        self,
        project_id: str,
        trace_id: str,
        session_id: str | None = None,
    ) -> str | None:
        """Restore the full file-mode `<trace_id>.jsonl` by trace_id (one event JSON per line).

        database mode rebuilds the rows from the tables; file mode returns the
        original `<trace_id>.jsonl` on disk. `session_id` is optional; file mode uses it to build the
        `<pid>/<sid>/<trace_id>.jsonl` path directly for an O(1) lookup (full scan when absent or on a miss).

        Deliberately **not** marked `abstractmethod` (same reason as get_span_detail); returns
        None by default -> 404 in the route. None means the trace does not exist.
        """
        return None
