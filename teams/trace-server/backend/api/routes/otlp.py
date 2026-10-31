"""OTLP/HTTP ingestion endpoint (default `POST /v1/traces`).

Deliberately not under the `/api/v1` prefix: OTLP clients are usually configured with
`http://host:4318/v1/traces`, so keeping the standard path makes direct integration easy.

Processing order (see §5.1 of the OTLP endpoint ingestion design doc):
read body -> gunzip -> decode by content-type -> mapper conversion -> sink delivery -> respond immediately.
"""
from __future__ import annotations

import gzip
import logging
from typing import Any

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from config import (
    OTLP_AUTH_TOKEN,
    OTLP_MAX_BODY_BYTES,
    OTLP_PATH,
)
from otlp import (
    OtlpDecodeError,
    build_json_response,
    build_protobuf_response,
    decode_body,
    map_resource_spans,
)

logger = logging.getLogger("trace_server.otlp")

router = APIRouter()


def _unauthorized() -> Response:
    return JSONResponse(
        status_code=401,
        content={"error": "Unauthorized"},
    )


def _check_auth(request: Request) -> bool:
    """Check Authorization: Bearer <token> when OTLP_AUTH_TOKEN is non-empty."""
    if not OTLP_AUTH_TOKEN:
        return True
    header = request.headers.get("authorization") or ""
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    return token == OTLP_AUTH_TOKEN


async def _read_body(request: Request) -> bytes:
    """Read the raw body (limited by OTLP_MAX_BODY_BYTES)."""
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > OTLP_MAX_BODY_BYTES:
            raise ValueError("body too large")
        chunks.append(chunk)
    return b"".join(chunks)


def _respond(request: Request, rejected: int, message: str | None) -> Response:
    """Return an ExportTraceServiceResponse in the format of the request content-type."""
    content_type = (request.headers.get("content-type") or "").lower()
    if "application/x-protobuf" in content_type:
        body = build_protobuf_response(rejected, message)
        if body is not None:
            return Response(content=body, media_type="application/x-protobuf")
        return Response(content=b"", media_type="application/x-protobuf")
    return JSONResponse(content=build_json_response(rejected, message))


async def _handle(request: Request) -> Response:
    if not _check_auth(request):
        return _unauthorized()

    try:
        body = await _read_body(request)
    except ValueError:
        logger.warning("OTLP request body exceeds the %d byte limit", OTLP_MAX_BODY_BYTES)
        return JSONResponse(status_code=413, content={"error": "body too large"})
    except Exception:
        logger.exception("OTLP failed to read the request body")
        return JSONResponse(status_code=400, content={"error": "read body failed"})

    if (request.headers.get("content-encoding") or "").lower().find("gzip") >= 0:
        try:
            body = gzip.decompress(body)
        except OSError:
            logger.warning("OTLP gzip decompression failed")
            return JSONResponse(
                status_code=400, content={"error": "decompress failed"}
            )

    if not body:
        return _respond(request, 0, None)

    try:
        resource_spans = decode_body(body, request.headers.get("content-type") or "")
    except OtlpDecodeError as exc:
        logger.warning("OTLP request parsing failed: %s", exc)
        return JSONResponse(status_code=400, content={"error": str(exc)})

    if not resource_spans:
        return _respond(request, 0, None)

    events, rejected = map_resource_spans(resource_spans)

    sink = getattr(request.app.state, "otlp_sink", None)
    if sink is None:
        logger.error("OTLP sink is not initialized; dropping %d events", len(events))
        return JSONResponse(
            status_code=503, content={"error": "otlp sink not ready"}
        )

    if not sink.offer(events):
        # Queue full: let the client retry with its own backoff (never drop silently)
        return JSONResponse(
            status_code=503, content={"error": "otlp queue full, retry later"}
        )

    message = f"rejected {rejected} span(s)" if rejected else None
    if rejected:
        logger.warning("OTLP failed to parse some spans: %d", rejected)
    return _respond(request, rejected, message)


@router.post(OTLP_PATH, include_in_schema=False)
async def ingest_traces(request: Request) -> Response:
    return await _handle(request)


# OTel clients may also export metrics / logs; return an empty 200 so they do not flood the error log
@router.post("/v1/metrics", include_in_schema=False)
async def ingest_metrics() -> Any:
    return {}


@router.post("/v1/logs", include_in_schema=False)
async def ingest_logs() -> Any:
    return {}
