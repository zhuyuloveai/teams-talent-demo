"""OTLP resourceSpans -> trace2 internal event dicts.

The produced events have exactly the same structure as `trace_sdk.events`, so they can go directly to:
- file sink: serialized as JSONL (readable by `file_backend` as is)
- kafka / redis sink: after delivery, `trace_consumer`'s `handle_event` writes them to the database

Event types: `trace` / `span` / `observation` / `session`.

Idempotency: `event_id` is derived deterministically from the OTel ID with uuid5, so retransmissions are idempotent.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from config import OTLP_DEFAULT_PROJECT_ID, OTLP_TIMEZONE

from .decode import parse_otel_id
from .semconv import (
    INPUT_OUTPUT_KEYS,
    INPUT_OUTPUT_PREFIXES,
    LF_AS_ROOT,
    LF_OBS_USAGE,
    LF_TRACE_NAME,
    LF_TRACE_TAGS,
    MODEL_KEYS,
    PROJECT_ID_KEYS,
    SESSION_ID_KEYS,
    SPAN_TYPES,
    TOOL_NAME_KEYS,
    TRACE_UPDATE_KEYS,
    USAGE_INPUT_KEYS,
    USAGE_OUTPUT_KEYS,
    USAGE_TOTAL_KEYS,
    has_trace_updates,
    infer_span_type,
)

# uuid5 namespace: a fixed value, so the same OTel ID always yields the same event_id in any process at any time
_NS = uuid.UUID("6f9619ff-8b86-d011-b42d-00c04fc964ff")

# input/output limit per span (characters); longer values are truncated and flagged
MAX_FIELD_CHARS = 9 * 1024 * 1024

_tz: Any = None


def _get_tz() -> Any:
    global _tz
    if _tz is None:
        try:
            _tz = ZoneInfo(OTLP_TIMEZONE)
        except Exception:
            _tz = timezone.utc
    return _tz


def _to_wall_clock(nanos: int | None) -> str:
    """Nanoseconds -> local wall-clock string `YYYY-MM-DD HH:MM:SS.mmm` (no time zone offset).

    Same convention as `events._now_iso()` on the SDK side: wall-clock only; when stored,
    `fields.dt()` strips tzinfo and keeps the literal value. Emitting UTC here would shift the frontend by 8 hours.
    """
    if nanos is None:
        return datetime.now(_get_tz()).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    try:
        seconds, rem = divmod(int(nanos), 1_000_000_000)
        dt = datetime.fromtimestamp(seconds, tz=_get_tz())
        return dt.strftime("%Y-%m-%d %H:%M:%S") + f".{rem // 1_000_000:03d}"
    except (OverflowError, OSError, ValueError):
        return datetime.now(_get_tz()).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]


def _parse_nano(raw: Any) -> int | None:
    """Accept three nanosecond timestamp forms: string / number / {high, low}.

    OTLP nanoseconds exceed 2^53, so integer arithmetic is required; never convert to float first.
    """
    if raw is None or raw == "":
        return None
    if isinstance(raw, dict):
        high, low = raw.get("high"), raw.get("low")
        if not isinstance(high, int) or not isinstance(low, int):
            return None
        return (high << 32) | (low & 0xFFFFFFFF)
    if isinstance(raw, bool):
        return None
    if isinstance(raw, int):
        return raw
    if isinstance(raw, str):
        try:
            return int(raw)
        except ValueError:
            return None
    return None


def hex_to_uuid(otel_hex: str) -> str:
    """OTel hex -> uuid string; a 16-char spanId is left-padded with zeros to 32 chars."""
    cleaned = (otel_hex or "").strip()
    if not cleaned:
        return str(uuid.UUID(int=0))
    return str(uuid.UUID(hex=cleaned.rjust(32, "0")[-32:]))


def _uuid5(*parts: str) -> str:
    return str(uuid.uuid5(_NS, ":".join(str(p) for p in parts)))


def flatten_attributes(raw: Any) -> dict[str, Any]:
    """OTLP attributes list -> flat dict.

    OTLP's `AnyValue` wraps values as `{stringValue} / {intValue} / {boolValue} / ...`;
    they are unwrapped into native Python values here, and unrecognized ones are kept as is.
    """
    out: dict[str, Any] = {}
    if not isinstance(raw, list):
        return out
    for item in raw:
        if not isinstance(item, dict):
            continue
        key = item.get("key")
        if not isinstance(key, str) or not key:
            continue
        out[key] = _unwrap_any_value(item.get("value"))
    return out


def _unwrap_any_value(value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    for key in (
        "stringValue",
        "intValue",
        "doubleValue",
        "boolValue",
        "bytesValue",
    ):
        if key in value:
            raw = value[key]
            if key == "intValue" and isinstance(raw, str):
                try:
                    return int(raw)
                except ValueError:
                    return raw
            return raw
    if "arrayValue" in value:
        values = value["arrayValue"]
        if isinstance(values, dict):
            values = values.get("values") or []
        if isinstance(values, list):
            return [_unwrap_any_value(v) for v in values]
        return []
    if "kvlistValue" in value:
        pairs = value["kvlistValue"]
        if isinstance(pairs, dict):
            pairs = pairs.get("values") or []
        return flatten_attributes(pairs)
    return value


def _first(attrs: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = attrs.get(key)
        if value not in (None, ""):
            return value
    return None


def _as_text(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        return str(value)


def _safe_json_loads(text: str) -> Any:
    """Try to parse a JSON string; return it unchanged on failure (a malformed attribute should not lose the whole span)."""
    stripped = text.strip()
    if not stripped or stripped[0] not in "{[":
        return text
    try:
        return json.loads(stripped)
    except (json.JSONDecodeError, ValueError):
        return text


def _parse_jsonish(value: Any) -> Any:
    """Parse an attribute value that may be a JSON string into an object."""
    if isinstance(value, str):
        return _safe_json_loads(value)
    return value


def _clip(value: Any) -> Any:
    """Limit the size of a single field so one row cannot blow up the table."""
    if value is None:
        return None
    text = _as_text(value)
    if text is None:
        return None
    if len(text) > MAX_FIELD_CHARS:
        return text[:MAX_FIELD_CHARS] + "...(truncated)"
    return value


def _extract_input_output(attrs: dict[str, Any]) -> tuple[Any, Any]:
    """Try to extract input / output in the §6.6 priority order; stop at the first hit."""
    for in_key, out_key in INPUT_OUTPUT_KEYS:
        has_in = in_key in attrs and attrs[in_key] not in (None, "")
        has_out = out_key in attrs and attrs[out_key] not in (None, "")
        if has_in or has_out:
            return (
                _parse_jsonish(attrs.get(in_key)) if has_in else None,
                _parse_jsonish(attrs.get(out_key)) if has_out else None,
            )

    # Assemble arrays from gen_ai.prompt.{i}.role/content and gen_ai.completion.{i}.*
    prompt = _assemble_indexed(attrs, "gen_ai.prompt.")
    completion = _assemble_indexed(attrs, "gen_ai.completion.")
    if prompt or completion:
        return (prompt or None, completion or None)
    return (None, None)


def _assemble_indexed(attrs: dict[str, Any], prefix: str) -> list[dict[str, Any]] | None:
    """Rebuild a message array from flat attributes of the form `<prefix><i>.<field>`."""
    buckets: dict[int, dict[str, Any]] = {}
    for key, value in attrs.items():
        if not key.startswith(prefix):
            continue
        rest = key[len(prefix):]
        index_str, _, field = rest.partition(".")
        if not index_str.isdigit() or not field:
            continue
        buckets.setdefault(int(index_str), {})[field] = _parse_jsonish(value)
    if not buckets:
        return None
    return [buckets[i] for i in sorted(buckets)]


def _extract_usage(attrs: dict[str, Any]) -> dict[str, int] | None:
    """Extract token usage; returns None when all are 0 (no observation is created)."""
    explicit = attrs.get(LF_OBS_USAGE)
    if explicit:
        parsed = _parse_jsonish(explicit)
        if isinstance(parsed, dict):
            def _num(*keys: str) -> int:
                for k in keys:
                    v = parsed.get(k)
                    if isinstance(v, (int, float)):
                        return int(v)
                    if isinstance(v, str) and v.isdigit():
                        return int(v)
                return 0

            prompt = _num("input", "prompt", "prompt_tokens", "input_tokens")
            completion = _num("output", "completion", "completion_tokens", "output_tokens")
            total = _num("total", "total_tokens")
            if prompt or completion or total:
                return {
                    "prompt_tokens": prompt,
                    "completion_tokens": completion,
                    "total_tokens": total or prompt + completion,
                }

    def _pick(keys: tuple[str, ...]) -> int:
        for key in keys:
            value = attrs.get(key)
            if isinstance(value, bool):
                continue
            if isinstance(value, int):
                return value
            if isinstance(value, float):
                return int(value)
            if isinstance(value, str) and value.strip().isdigit():
                return int(value.strip())
        return 0

    prompt = _pick(USAGE_INPUT_KEYS)
    completion = _pick(USAGE_OUTPUT_KEYS)
    total = _pick(USAGE_TOTAL_KEYS)
    if not (prompt or completion or total):
        return None
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": total or prompt + completion,
    }


def _extract_error(span: dict[str, Any], attrs: dict[str, Any]) -> dict[str, Any] | None:
    status = span.get("status") or {}
    message = status.get("message")
    exc_type = attrs.get("exception.type")
    exc_msg = attrs.get("exception.message")
    stack = attrs.get("exception.stacktrace")
    if not any((message, exc_type, exc_msg, stack)):
        return None
    return {
        "error_type": exc_type,
        "message": exc_msg or message,
        "stack_trace": stack,
    }


def _extract_tags(attrs: dict[str, Any]) -> list[str] | None:
    raw = attrs.get(LF_TRACE_TAGS)
    if raw is None:
        return None
    parsed = _parse_jsonish(raw)
    if isinstance(parsed, list):
        return [str(t) for t in parsed]
    if isinstance(parsed, str):
        return [t.strip() for t in parsed.split(",") if t.strip()]
    return None


def _leftover_attributes(attrs: dict[str, Any]) -> dict[str, Any]:
    """Remove attributes already consumed by input/output/metadata; the rest is kept for the file-mode record."""
    out: dict[str, Any] = {}
    for key, value in attrs.items():
        if any(key == p or key.startswith(p) for p in INPUT_OUTPUT_PREFIXES):
            continue
        if key in TRACE_UPDATE_KEYS or key in MODEL_KEYS or key in TOOL_NAME_KEYS:
            continue
        out[key] = value
    return out


def _status_of(span: dict[str, Any]) -> str:
    code = (span.get("status") or {}).get("code")
    # OTLP: 0=UNSET, 1=OK, 2=ERROR
    return "error" if code == 2 else "success"


def map_resource_spans(
    resource_spans: list[dict[str, Any]],
    *,
    default_project_id: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """resourceSpans -> (event list, number of rejected spans).

    An error in one span only increments the rejected count and does not affect other spans in the batch.
    Trace-level stats (span/tool counts, whether there is an error) are aggregated per trace_id over the **whole batch**,
    without looking back across requests (see design §7.4).
    """
    fallback_project = default_project_id or OTLP_DEFAULT_PROJECT_ID

    # ---- Pass 1: flatten scopeSpans into a context list and compute per-trace metrics ----
    scopes: list[dict[str, Any]] = []
    counts: dict[str, dict[str, int]] = {}
    for resource_span in resource_spans or []:
        if not isinstance(resource_span, dict):
            continue
        resource = resource_span.get("resource") or {}
        resource_attrs = flatten_attributes(resource.get("attributes"))
        for scope_span in resource_span.get("scopeSpans") or []:
            if not isinstance(scope_span, dict):
                continue
            scope = scope_span.get("scope") or {}
            scopes.append(
                {
                    "resource_attrs": resource_attrs,
                    "scope_name": scope.get("name"),
                    "scope_meta": {"name": scope.get("name"), "version": scope.get("version")},
                    "spans": scope_span.get("spans") or [],
                }
            )
            for span in scope_span.get("spans") or []:
                if not isinstance(span, dict):
                    continue
                trace_hex = parse_otel_id(span.get("traceId"))
                if not trace_hex:
                    continue
                attrs = flatten_attributes(span.get("attributes"))
                stat = counts.setdefault(
                    trace_hex, {"span": 0, "tool": 0, "error": 0}
                )
                stat["span"] += 1
                if (
                    infer_span_type(attrs, resource_attrs, scope.get("name"), span.get("name"))
                    == "tool"
                ):
                    stat["tool"] += 1
                if _status_of(span) == "error":
                    stat["error"] += 1

    # ---- Pass 2: generate internal events span by span ----
    events: list[dict[str, Any]] = []
    rejected = 0
    seen_sessions: set[str] = set()
    for scope in scopes:
        resource_attrs = scope["resource_attrs"]
        project_id = str(
            _first(resource_attrs, PROJECT_ID_KEYS) or fallback_project
        )[:64]
        agent_name = resource_attrs.get("service.name")

        for span in scope["spans"]:
            if not isinstance(span, dict):
                rejected += 1
                continue
            try:
                produced = _map_span(
                    span=span,
                    resource_attrs=resource_attrs,
                    scope_name=scope["scope_name"],
                    scope_meta=scope["scope_meta"],
                    project_id=project_id,
                    agent_name=agent_name,
                    counts=counts,
                    seen_sessions=seen_sessions,
                )
            except Exception:
                rejected += 1
                continue
            events.extend(produced)

    return events, rejected


def _map_span(
    *,
    span: dict[str, Any],
    resource_attrs: dict[str, Any],
    scope_name: str | None,
    scope_meta: dict[str, Any],
    project_id: str,
    agent_name: Any,
    counts: dict[str, dict[str, int]],
    seen_sessions: set[str],
) -> list[dict[str, Any]]:
    attrs = flatten_attributes(span.get("attributes"))
    trace_hex = parse_otel_id(span.get("traceId"))
    span_hex = parse_otel_id(span.get("spanId"))
    parent_hex = parse_otel_id(span.get("parentSpanId")) if span.get("parentSpanId") else ""

    if not trace_hex or not span_hex:
        raise ValueError("missing traceId / spanId")

    trace_id = hex_to_uuid(trace_hex)
    span_id = hex_to_uuid(span_hex)
    parent_span_id = hex_to_uuid(parent_hex) if parent_hex else None

    name = span.get("name") or attrs.get("gen_ai.operation.name") or "span"
    span_type = infer_span_type(attrs, resource_attrs, scope_name, name)
    if span_type not in SPAN_TYPES:
        span_type = "span"

    start_nanos = _parse_nano(span.get("startTimeUnixNano"))
    end_nanos = _parse_nano(span.get("endTimeUnixNano"))
    if start_nanos is None and end_nanos is not None:
        start_nanos = end_nanos
    started_at = _to_wall_clock(start_nanos)
    duration_ms = (
        max(int((end_nanos - start_nanos) // 1_000_000), 0)
        if start_nanos is not None and end_nanos is not None
        else None
    )

    status = _status_of(span)
    error_info = _extract_error(span, attrs)
    model = _first(attrs, MODEL_KEYS)
    tool_name = _first(attrs, TOOL_NAME_KEYS)
    session_id = _first(attrs, SESSION_ID_KEYS)
    session_id = str(session_id)[:64] if session_id else None

    is_root = not parent_hex or str(attrs.get(LF_AS_ROOT)).lower() == "true"
    events: list[dict[str, Any]] = []

    # ---- trace event ----
    trace_event_id = _uuid5(project_id, trace_id)
    stat = counts.get(trace_hex, {"span": 0, "tool": 0, "error": 0})
    # Any child span with error => the whole trace counts as error (design §7.4)
    trace_status = "error" if stat.get("error") else status
    base_trace = {
        "event_type": "trace",
        "event_id": trace_event_id,
        "project_id": project_id,
        "id": trace_id,
        "trace_id": trace_id,
        "session_id": session_id,
        "created_at": started_at,
        "started_at": started_at,
    }

    if is_root:
        trace_input, trace_output = _extract_input_output(attrs)
        events.append(
            {
                **base_trace,
                "name": str(attrs.get(LF_TRACE_NAME) or name)[:255],
                "agent_name": str(agent_name)[:255] if agent_name else None,
                "input": _clip(trace_input),
                "output": _clip(trace_output),
                "duration_ms": duration_ms,
                "react_step_count": 0,
                "tool_count": stat["tool"],
                "span_count": stat["span"],
                "status": trace_status,
                "error_info": error_info,
                "tags": _extract_tags(attrs),
                "trace_insert_only": False,
            }
        )
    elif has_trace_updates(attrs):
        trace_input, trace_output = _extract_input_output(attrs)
        update = {**base_trace, "trace_insert_only": False, "status": trace_status}
        if attrs.get(LF_TRACE_NAME):
            update["name"] = str(attrs[LF_TRACE_NAME])[:255]
        if trace_input is not None:
            update["input"] = _clip(trace_input)
        if trace_output is not None:
            update["output"] = _clip(trace_output)
        if error_info is not None:
            update["error_info"] = error_info
        tags = _extract_tags(attrs)
        if tags:
            update["tags"] = tags
        events.append(update)
    else:
        # Placeholder trace: only ensures the trace row exists and never overwrites existing complete data
        events.append({**base_trace, "status": "success", "trace_insert_only": True})

    # ---- span event ----
    span_input, span_output = _extract_input_output(attrs)
    events.append(
        {
            "event_type": "span",
            "event_id": _uuid5(project_id, span_id),
            "project_id": project_id,
            "id": span_id,
            "trace_id": trace_id,
            "span_id": span_id,
            "parent_span_id": parent_span_id,
            "session_id": session_id,
            "name": str(name)[:255],
            "span_type": span_type,
            "input": _clip(span_input),
            "output": _clip(span_output),
            "duration_ms": duration_ms,
            "model": str(model)[:255] if model else None,
            "tool_name": str(tool_name)[:255] if tool_name else None,
            "status": status,
            "error_info": error_info,
            "started_at": started_at,
            "created_at": started_at,
            "_otel": {
                "attributes": _leftover_attributes(attrs),
                "resource": resource_attrs,
                "scope": scope_meta,
            },
        }
    )

    # ---- observation (only created when there is usage) ----
    usage = _extract_usage(attrs)
    if usage:
        events.append(
            {
                "event_type": "observation",
                "event_id": _uuid5(project_id, span_id, "obs"),
                "id": _uuid5(project_id, span_id, "obs"),
                "project_id": project_id,
                "trace_id": trace_id,
                "span_id": span_id,
                "model": str(model)[:255] if model else None,
                "prompt_tokens": usage["prompt_tokens"],
                "completion_tokens": usage["completion_tokens"],
                "total_tokens": usage["total_tokens"],
                "input": None,
                "output": None,
                "created_at": started_at,
            }
        )

    # ---- session event (sent once per session per batch) ----
    if session_id and session_id not in seen_sessions:
        seen_sessions.add(session_id)
        events.append(
            {
                "event_type": "session",
                "event_id": _uuid5(project_id, session_id, "session"),
                "project_id": project_id,
                "session_id": session_id,
                "trace_id": trace_id,
                "name": f"session-{session_id[:8]}",
                "user_id": attrs.get("user.id") or attrs.get("langfuse.user.id"),
                "metadata": None,
                "created_at": started_at,
            }
        )

    return events
