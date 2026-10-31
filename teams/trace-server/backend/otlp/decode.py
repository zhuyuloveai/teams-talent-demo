"""OTLP/HTTP request body decoding (supports both protobuf and JSON).

Both paths end up as an **OTLP/JSON-shaped dict** (lowerCamelCase),
so the mapper only handles one structure.

Key difference: after protobuf decoding `traceId` / `spanId` are bytes, which MessageToDict
turns into base64 strings, while the OTLP/JSON spec uses hex strings. `parse_otel_id`
handles both forms; otherwise ID parsing would be wrong.
"""
from __future__ import annotations

import base64
import json
import re
from typing import Any

_HEX32 = re.compile(r"^[0-9a-fA-F]{32}$")
_HEX16 = re.compile(r"^[0-9a-fA-F]{16}$")


class OtlpDecodeError(ValueError):
    """The request body cannot be parsed as OTLP (the route returns 400)."""


def parse_otel_id(raw: Any) -> str:
    """Normalize an OTLP ID field to a lowercase hex string (32 chars for trace / 16 for span).

    Supports three forms:
    - bytes / bytearray: raw protobuf bytes
    - hex string: the OTLP/JSON spec form
    - base64 string: MessageToDict's default output for bytes
    """
    if raw is None:
        return ""
    if isinstance(raw, (bytes, bytearray)):
        return bytes(raw).hex()
    if isinstance(raw, str):
        if _HEX32.match(raw) or _HEX16.match(raw):
            return raw.lower()
        try:
            decoded = base64.b64decode(raw, validate=True)
        except Exception:
            return raw.strip().lower()
        return decoded.hex()
    return str(raw).strip().lower()


def _decode_protobuf(body: bytes) -> list[dict[str, Any]]:
    """protobuf -> list of OTLP/JSON-shaped resourceSpans.

    Lazy dependency loading: a missing protobuf does not stop the rest of the server from starting;
    it only errors when this content-type is used.
    """
    try:
        from google.protobuf.json_format import MessageToDict
        from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import (
            ExportTraceServiceRequest,
        )
    except ImportError as exc:  # pragma: no cover - fallback when the dependency is missing
        raise OtlpDecodeError(f"OTLP protobuf dependency is not installed: {exc}") from exc

    msg = ExportTraceServiceRequest()
    try:
        msg.ParseFromString(body)
    except Exception as exc:
        raise OtlpDecodeError(f"protobuf parsing failed: {exc}") from exc

    # preserving_proto_field_name=False -> lowerCamelCase, same as OTLP/JSON
    data = MessageToDict(msg, preserving_proto_field_name=False)
    return data.get("resourceSpans") or []


def _decode_json(body: bytes) -> list[dict[str, Any]]:
    try:
        data = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise OtlpDecodeError(f"JSON parsing failed: {exc}") from exc
    if not isinstance(data, dict):
        raise OtlpDecodeError("OTLP JSON root must be an object")
    spans = data.get("resourceSpans")
    if spans is None:
        return []
    if not isinstance(spans, list):
        raise OtlpDecodeError("resourceSpans must be an array")
    return spans


def decode_body(body: bytes, content_type: str) -> list[dict[str, Any]]:
    """Decode the request body by content-type and return the resourceSpans list.

    Raises:
        OtlpDecodeError: parsing failed or the content-type is not supported.
    """
    ct = (content_type or "").lower()
    if "application/x-protobuf" in ct:
        return _decode_protobuf(body)
    if "application/json" in ct:
        return _decode_json(body)
    raise OtlpDecodeError(f"Unsupported Content-Type: {content_type!r}")


def build_protobuf_response(rejected: int, error_message: str | None) -> bytes | None:
    """Build an ExportTraceServiceResponse (protobuf).

    Returns None when the dependency is missing or building fails; the caller falls back to an empty body (accepted by OTel clients).
    """
    try:
        from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import (
            ExportTraceServiceResponse,
        )
    except ImportError:  # pragma: no cover
        return None

    resp = ExportTraceServiceResponse()
    if rejected:
        resp.partial_success.rejected_spans = rejected
        if error_message:
            resp.partial_success.error_message = error_message
    return resp.SerializeToString()


def build_json_response(rejected: int, error_message: str | None) -> dict[str, Any]:
    """Build an OTLP/JSON-shaped response body (an empty object when nothing failed)."""
    if not rejected:
        return {}
    partial: dict[str, Any] = {"rejectedSpans": rejected}
    if error_message:
        partial["errorMessage"] = error_message
    return {"partialSuccess": partial}
