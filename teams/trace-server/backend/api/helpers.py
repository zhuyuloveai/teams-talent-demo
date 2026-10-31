"""Database row -> Pydantic model conversion + call tree assembly."""
from __future__ import annotations

import json
from typing import Any

from .schemas import (
    ErrorInfoOut,
    LlmRequestOut,
    ObservationOut,
    SpanBriefOut,
    SpanOut,
    TraceNodeOut,
    TraceOut,
)


def _decode_jsonb(value: Any) -> Any:
    """Deserialize a jsonb field from the ORM (possibly str/None) into dict/list.

    asyncpg/SQLAlchemy return jsonb columns as str by default; the frontend needs native objects.
    """
    if value is None or isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return value
    return value


def _error_info(raw: Any) -> ErrorInfoOut | None:
    if not raw:
        return None
    # DB error_info may be JSONB (dict) or a string
    if isinstance(raw, dict):
        return ErrorInfoOut(
            errorType=raw.get("error_type") or raw.get("errorType"),
            errorCode=raw.get("error_code") or raw.get("errorCode"),
            errorCategory=raw.get("error_category") or raw.get("errorCategory"),
            message=raw.get("message"),
            stackTrace=raw.get("stack_trace") or raw.get("stackTrace"),
        )
    if isinstance(raw, str):
        return ErrorInfoOut(message=raw)
    return None


def _iso(dt: Any) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    return dt.isoformat() if hasattr(dt, "isoformat") else str(dt)


def trace_out(row: dict) -> TraceOut:
    return TraceOut(
        id=str(row["id"]),
        eventId=str(row["event_id"]) if row.get("event_id") else None,
        projectId=str(row["project_id"]) if row.get("project_id") else None,
        sessionId=str(row["session_id"]) if row.get("session_id") else None,
        name=row.get("name"),
        agentName=row.get("agent_name"),
        input=_decode_jsonb(row.get("input")),
        output=_decode_jsonb(row.get("output")),
        durationMs=row.get("duration_ms"),
        totalTokens=row.get("total_tokens"),
        promptTokens=row.get("prompt_tokens"),
        completionTokens=row.get("completion_tokens"),
        reactStepCount=row.get("react_step_count"),
        toolCount=row.get("tool_count"),
        spanCount=row.get("span_count"),
        status=row.get("status") or "success",
        errorInfo=_error_info(row.get("error_info")),
        startedAt=_iso(row.get("started_at") or row.get("created_at")),
    )


def span_out(row: dict) -> SpanOut:
    return SpanOut(
        id=str(row["id"]),
        eventId=str(row["event_id"]) if row.get("event_id") else None,
        traceId=str(row["trace_id"]),
        parentSpanId=str(row["parent_span_id"]) if row.get("parent_span_id") else None,
        name=row["name"],
        spanType=row["span_type"],
        input=_decode_jsonb(row.get("input")),
        output=_decode_jsonb(row.get("output")),
        durationMs=row.get("duration_ms"),
        model=row.get("model"),
        toolName=row.get("tool_name"),
        status=row.get("status") or "success",
        errorInfo=_error_info(row.get("error_info")),
        startedAt=_iso(row.get("started_at") or row.get("created_at")),
    )


def span_brief_out(row: dict) -> SpanBriefOut:
    """Lightweight tree node conversion: deliberately skips input/output/errorInfo (fetched individually on click)."""
    return SpanBriefOut(
        id=str(row["id"]),
        eventId=str(row["event_id"]) if row.get("event_id") else None,
        traceId=str(row["trace_id"]),
        parentSpanId=str(row["parent_span_id"]) if row.get("parent_span_id") else None,
        name=row["name"],
        spanType=row["span_type"],
        durationMs=row.get("duration_ms"),
        model=row.get("model"),
        toolName=row.get("tool_name"),
        status=row.get("status") or "success",
        startedAt=_iso(row.get("started_at") or row.get("created_at")),
    )


def llm_request_out(row: dict) -> LlmRequestOut:
    return LlmRequestOut(
        eventId=str(row["event_id"]),
        spanId=str(row["span_id"]) if row.get("span_id") else None,
        model=row.get("model"),
        input=_decode_jsonb(row.get("input")),
        output=_decode_jsonb(row.get("output")),
        status=row.get("status") or "success",
        errorInfo=_error_info(row.get("error_info")),
        startedAt=_iso(row.get("started_at") or row.get("created_at")),
    )


def observation_out(row: dict) -> ObservationOut:
    return ObservationOut(
        id=str(row["id"]),
        spanId=str(row["span_id"]) if row.get("span_id") else None,
        model=row.get("model"),
        promptTokens=row.get("prompt_tokens"),
        completionTokens=row.get("completion_tokens"),
        totalTokens=row.get("total_tokens"),
    )


def build_tree(spans: list[SpanBriefOut | SpanOut]) -> list[TraceNodeOut]:
    """Assemble the call tree by parent_span_id; siblings are sorted by started_at ascending.

    spans may be lightweight SpanBriefOut (DB mode /tree) or full SpanOut
    (file mode); both have id / parentSpanId / startedAt.
    """
    nodes: dict[str, TraceNodeOut] = {}
    for s in spans:
        nodes[s.id] = TraceNodeOut(span=s, children=[])
    roots: list[TraceNodeOut] = []
    for s in spans:
        node = nodes[s.id]
        if s.parentSpanId and s.parentSpanId in nodes:
            nodes[s.parentSpanId].children.append(node)
        else:
            roots.append(node)

    def sort_rec(n: TraceNodeOut) -> None:
        n.children.sort(
            key=lambda c: c.span.startedAt or "" if c.span else ""
        )
        for c in n.children:
            sort_rec(c)

    for r in roots:
        sort_rec(r)
    return roots
