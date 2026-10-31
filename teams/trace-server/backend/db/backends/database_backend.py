"""database storage backend: query implementation on top of the existing SQLAlchemy Repository."""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..repositories.trace_repository import TraceRepository
from .base import SpanData, StorageBackend, TraceData


def _decode_jsonb(value: Any) -> Any:
    """ORM jsonb fields come back as str by default; the frontend needs native objects."""
    if value is None or isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return value
    return value


class DatabaseBackend(StorageBackend):
    def __init__(self, session: AsyncSession):
        self._trace_repo = TraceRepository(session)

    # ---- Trace queries ----

    async def list_traces(
        self,
        project_id: str,
        page: int = 1,
        page_size: int = 20,
        agent_name: str | None = None,
        status: str | None = None,
        session_id: str | None = None,
        trace_id: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        rows, total = await self._trace_repo.list_traces(
            project_id,
            page=page,
            page_size=page_size,
            agent_name=agent_name,
            status=status,
            session_id=session_id,
            trace_id=trace_id,
        )
        # ORM -> dict (the route layer no longer depends on the ORM)
        items = [_trace_dict(t) for t in rows]
        await self._apply_token_totals(items)
        return items, total

    async def _apply_token_totals(self, items: list[dict[str, Any]]) -> None:
        """Overwrite the trace dict with token usage aggregated live from observations.

        total_tokens in the traces table is the SDK's single-process sum and misses cross-process sub-agents;
        summing observations by trace_id at query time gives the complete, correct value.
        total is the sum of the raw observations.total_tokens values (a model may count cache/system overhead
        in total but not in prompt/completion, so total != prompt + completion).
        """
        if not items:
            return
        ids = [str(t["id"]) for t in items]
        totals = await self._trace_repo.get_token_totals(ids)
        for t in items:
            agg = totals.get(t["id"])
            prompt = agg["prompt_tokens"] if agg else 0
            completion = agg["completion_tokens"] if agg else 0
            total = agg["total_tokens"] if agg else 0
            t["total_tokens"] = total or (prompt + completion)
            t["prompt_tokens"] = prompt
            t["completion_tokens"] = completion

    async def get_trace_detail(
        self,
        project_id: str,
        trace_id: str,
        session_id: str | None = None,
    ) -> TraceData | None:
        t = await self._trace_repo.get_trace(project_id, trace_id)
        if t is None:
            return None
        spans = await self._trace_repo.get_spans(trace_id)
        obs = await self._trace_repo.get_observations(trace_id)
        trace = _trace_dict(t)
        await self._apply_token_totals([trace])
        return TraceData(
            trace=trace,
            spans=[_span_dict(s) for s in spans],
            observations=[_obs_dict(o) for o in obs],
        )

    async def get_llm_request(
        self, project_id: str, event_id: str
    ) -> dict[str, Any] | None:
        r = await self._trace_repo.get_llm_request(project_id, event_id)
        return _llm_request_dict(r) if r is not None else None

    async def get_span_detail(
        self,
        project_id: str,
        trace_id: str,
        span_id: str,
        session_id: str | None = None,
    ) -> SpanData | None:
        """Single span lazy load: two index hits, the spans.id primary key + idx_observations_span."""
        s = await self._trace_repo.get_span(span_id)
        if s is None or str(s.trace_id) != trace_id:
            # Ownership check: a span from another trace is treated as not found, avoiding frontend cache key collisions
            return None
        obs = await self._trace_repo.get_observations_by_span(span_id)
        return SpanData(span=_span_dict(s), observations=[_obs_dict(o) for o in obs])

    # ---- File-mode restore ----

    async def export_trace_jsonl(
        self,
        project_id: str,
        trace_id: str,
        session_id: str | None = None,
    ) -> str | None:
        """Rebuild the full file-mode <trace_id>.jsonl from the tables by trace_id.

        Field order matches, line by line, the real jsonl lines written by the SDK FileExporter. Columns the DB does not persist
        (span model_parameters/level/metadata/tags/time_to_first_token_ms,
        trace tags, session event event_id) are always written as null to keep the line shape consistent.

        llm_requests are not written: in file mode they are stored as separate llm_request/<event_id>.json files
        and are not part of the <trace_id>.jsonl lines.
        """
        t = await self._trace_repo.get_trace(project_id, trace_id)
        if t is None:
            return None
        # Tokens must be aggregated live (the traces table does not store token totals)
        trace = _trace_dict(t)
        await self._apply_token_totals([trace])
        sid = trace.get("session_id")

        spans = await self._trace_repo.get_spans(trace_id)
        obs = await self._trace_repo.get_observations(trace_id)

        lines: list[dict[str, Any]] = []
        if sid:
            lines.append(await self._session_event_line(sid, trace))
        # The file is in append order (created_at is not monotonic); merge span/observation by created_at here
        # to approximate the interleaved write order
        children: list[tuple[Any, dict[str, Any]]] = []
        for s in spans:
            children.append((s.created_at, _span_event_line(s, sid)))
        for o in obs:
            children.append((o.created_at, _observation_event_line(o, sid)))
        # Rows with created_at None go last (like Java's nullsLast)
        children.sort(key=lambda pair: (pair[0] is None, pair[0]))
        lines.extend(ev for _, ev in children)
        # The trace summary event is written last in the file
        lines.append(_trace_event_line(trace))
        return "".join(
            json.dumps(ev, ensure_ascii=False, default=str) + "\n" for ev in lines
        )

    async def _session_event_line(
        self, session_id: str, trace: dict[str, Any]
    ) -> dict[str, Any]:
        s = await self._trace_repo.get_session(session_id)
        return {
            "event_type": "session",
            # The sessions table does not store the session event's event_id, so it can only be null
            "event_id": None,
            "project_id": trace.get("project_id"),
            "created_at": _iso(s.created_at) if s else None,
            "session_id": session_id,
            "trace_id": trace.get("id"),
            "name": s.name if s else None,
            "user_id": s.user_id if s else None,
            "metadata": _decode_jsonb(s.metadata_json) if s else None,
        }

# ---- ORM object -> JSONL event line (field order matches to_dict() in the SDK's events.py) ----

def _span_event_line(s: Any, session_id: str | None) -> dict[str, Any]:
    return {
        "event_type": "span",
        "event_id": str(s.event_id) if s.event_id else None,
        "project_id": str(s.project_id),
        "created_at": _iso(s.created_at),
        "id": str(s.id),
        "trace_id": str(s.trace_id),
        "span_id": str(s.id),
        "parent_span_id": str(s.parent_span_id) if s.parent_span_id else None,
        "name": s.name,
        "span_type": s.span_type,
        "input": _decode_jsonb(s.input),
        "output": _decode_jsonb(s.output),
        "duration_ms": s.duration_ms,
        "model": s.model,
        "model_parameters": None,       # not persisted in DB
        "tool_name": s.tool_name,
        "status": s.status,
        "level": None,                  # not persisted in DB
        "metadata": None,               # not persisted in DB
        "tags": None,                   # not persisted in DB
        "error_info": _decode_jsonb(s.error_info),
        "time_to_first_token_ms": None, # not persisted in DB
        "started_at": _iso(s.started_at),
        "session_id": session_id,
    }


def _observation_event_line(o: Any, session_id: str | None) -> dict[str, Any]:
    return {
        "event_type": "observation",
        "event_id": str(o.event_id) if o.event_id else None,
        "project_id": str(o.project_id),
        "created_at": _iso(o.created_at),
        "id": str(o.id),
        "trace_id": str(o.trace_id),
        "span_id": str(o.span_id) if o.span_id else None,
        "model": o.model,
        "prompt_tokens": o.prompt_tokens,
        "completion_tokens": o.completion_tokens,
        "total_tokens": o.total_tokens,
        "input": _decode_jsonb(o.input),
        "output": _decode_jsonb(o.output),
        "session_id": session_id,
    }


def _trace_event_line(t: dict[str, Any]) -> dict[str, Any]:
    return {
        "event_type": "trace",
        "event_id": t.get("event_id"),
        "project_id": t.get("project_id"),
        "created_at": _iso(t.get("created_at")),
        "id": t.get("id"),
        "trace_id": t.get("id"),
        "session_id": t.get("session_id"),
        "name": t.get("name"),
        "agent_name": t.get("agent_name"),
        "input": t.get("input"),
        "output": t.get("output"),
        "duration_ms": t.get("duration_ms"),
        "total_tokens": t.get("total_tokens"),
        "prompt_tokens": t.get("prompt_tokens"),
        "completion_tokens": t.get("completion_tokens"),
        "react_step_count": t.get("react_step_count"),
        "tool_count": t.get("tool_count"),
        "span_count": t.get("span_count"),
        "status": t.get("status"),
        "error_info": t.get("error_info"),
        "tags": None,                   # not persisted in DB
        "started_at": _iso(t.get("started_at")),
    }


def _iso(value: Any) -> str | None:
    """datetime -> ISO string.

    `started_at` is a time-zone-less TIMESTAMP (no offset); `created_at`/`updated_at` are
    TIMESTAMPTZ (read back as UTC, ending in `Z`).
    """
    if isinstance(value, datetime):
        return value.isoformat().replace("+00:00", "Z")
    return value


# ---- ORM object -> dict ----

def _trace_dict(t: Any) -> dict:
    return {
        "id": str(t.id),
        "event_id": str(t.event_id) if t.event_id else None,
        "project_id": str(t.project_id),
        "name": t.name,
        "agent_name": t.agent_name,
        "input": _decode_jsonb(t.input),
        "output": _decode_jsonb(t.output),
        "duration_ms": t.duration_ms,
        "react_step_count": t.react_step_count,
        "tool_count": t.tool_count,
        "span_count": t.span_count,
        "session_id": t.session_id,
        "status": t.status,
        "error_info": t.error_info,
        "started_at": t.started_at,
        "created_at": t.created_at,
    }


def _span_dict(s: Any) -> dict:
    return {
        "id": str(s.id),
        "event_id": str(s.event_id),
        "trace_id": str(s.trace_id),
        "parent_span_id": str(s.parent_span_id) if s.parent_span_id else None,
        "name": s.name,
        "span_type": s.span_type,
        "input": _decode_jsonb(s.input),
        "output": _decode_jsonb(s.output),
        "duration_ms": s.duration_ms,
        "model": s.model,
        "tool_name": s.tool_name,
        "status": s.status,
        "error_info": s.error_info,
        "started_at": s.started_at,
        "created_at": s.created_at,
    }


def _llm_request_dict(r: Any) -> dict:
    return {
        "event_id": str(r.event_id),
        "id": str(r.id),
        "trace_id": str(r.trace_id),
        "span_id": str(r.span_id) if r.span_id else None,
        "model": r.model,
        "input": _decode_jsonb(r.input),
        "output": _decode_jsonb(r.output),
        "status": r.status,
        "error_info": r.error_info,
        "started_at": r.started_at,
    }


def _obs_dict(o: Any) -> dict:
    return {
        "id": str(o.id),
        "span_id": str(o.span_id) if o.span_id else None,
        "model": o.model,
        "prompt_tokens": o.prompt_tokens,
        "completion_tokens": o.completion_tokens,
        "total_tokens": o.total_tokens,
        "input": _decode_jsonb(o.input),
        "output": _decode_jsonb(o.output),
    }
