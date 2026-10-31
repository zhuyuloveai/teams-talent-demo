"""Trace API: list / detail / call tree / single span detail (data accessed through the storage backend)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from ..deps import get_storage_backend
from ..helpers import (
    build_tree,
    llm_request_out,
    observation_out,
    span_brief_out,
    span_out,
    trace_out,
)
from ..schemas import (
    LlmRequestOut,
    SpanDetailOut,
    TraceDetailOut,
    TraceListOut,
    TraceTreeOut,
)
from config import STORAGE_BACKEND
from db.backends.base import StorageBackend

router = APIRouter()


@router.get("/projects/{project_id}/traces", response_model=TraceListOut)
async def list_traces(
    project_id: str,
    page: int = 1,
    page_size: int = 20,
    agent_name: str | None = None,
    status: str | None = None,
    session_id: str | None = None,
    trace_id: str | None = None,
    backend: StorageBackend = Depends(get_storage_backend),
):
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    rows, total = await backend.list_traces(
        project_id,
        page=page,
        page_size=page_size,
        agent_name=agent_name,
        status=status,
        session_id=session_id,
        trace_id=trace_id,
    )
    return TraceListOut(
        items=[trace_out(t) for t in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/projects/{project_id}/traces/{trace_id}", response_model=TraceDetailOut)
async def get_trace_detail(
    project_id: str,
    trace_id: str,
    session_id: str | None = None,
    backend: StorageBackend = Depends(get_storage_backend),
):
    # Detail is looked up directly by trace_id; with project_id/session_id the file backend
    # locates the file by path in O(1) (no full scan) and falls back to a full scan on a miss.
    data = await backend.get_trace_detail(project_id, trace_id, session_id=session_id)
    if data is None:
        raise HTTPException(status_code=404, detail="trace not found")
    return TraceDetailOut(
        trace=trace_out(data.trace),
        spans=[span_out(s) for s in data.spans],
        observations=[observation_out(o) for o in data.observations],
    )


@router.get("/projects/{project_id}/traces/{trace_id}/tree", response_model=TraceTreeOut)
async def get_trace_tree(
    project_id: str,
    trace_id: str,
    session_id: str | None = None,
    backend: StorageBackend = Depends(get_storage_backend),
):
    # The call tree uses the same lookup as detail (direct path lookup with session_id, fallback on a miss)
    data = await backend.get_trace_detail(project_id, trace_id, session_id=session_id)
    if data is None:
        raise HTTPException(status_code=404, detail="trace not found")
    # DB mode: /tree returns brief nodes (the frontend injects fetchSpanDetail to fill in input/output on demand)
    # file mode: /tree returns full SpanOut (the frontend does not lazy-load and renders input/output from here)
    if STORAGE_BACKEND == "database":
        span_list: list = [span_brief_out(s) for s in data.spans]
    else:
        span_list = [span_out(s) for s in data.spans]
    return TraceTreeOut(trace=trace_out(data.trace), tree=build_tree(span_list))


@router.get(
    "/projects/{project_id}/traces/{trace_id}/spans/{span_id}",
    response_model=SpanDetailOut,
)
async def get_span_detail(
    project_id: str,
    trace_id: str,
    span_id: str,
    session_id: str | None = None,
    backend: StorageBackend = Depends(get_storage_backend),
):
    # Lazy-load entry point for single span detail: DB mode uses PK + index; the file backend returns
    # None by default (not implemented per decision 2), so this is a natural 404 and the route needs no mode branch.
    if not project_id or project_id.strip() == "":
        raise HTTPException(
            status_code=400,
            detail="project_id must not be empty; specify a concrete project id",
        )
    data = await backend.get_span_detail(
        project_id, trace_id, span_id, session_id=session_id
    )
    if data is None:
        raise HTTPException(status_code=404, detail="span not found")
    return SpanDetailOut(
        span=span_out(data.span),
        observations=[observation_out(o) for o in data.observations],
    )


@router.get(
    "/projects/{project_id}/llm_requests/{event_id}",
    response_model=LlmRequestOut,
)
async def get_llm_request(
    project_id: str,
    event_id: str,
    backend: StorageBackend = Depends(get_storage_backend),
):
    # Real LLM requests are located by project_id + event_id: file mode uses this to narrow the scan to
    # <data_dir>/<project_id>, avoiding a full cross-project walk (leftover sess-bench data slows it down).
    # project_id must be a concrete project id; empty values are rejected.
    if not project_id or project_id.strip() == "":
        raise HTTPException(
            status_code=400,
            detail="project_id must not be empty; specify a concrete project id",
        )
    item = await backend.get_llm_request(project_id, event_id)
    if item is None:
        raise HTTPException(status_code=404, detail="llm request not found")
    return llm_request_out(item)


@router.get("/projects/{project_id}/traces/{trace_id}/export")
async def export_trace_jsonl(
    project_id: str,
    trace_id: str,
    session_id: str | None = None,
    backend: StorageBackend = Depends(get_storage_backend),
):
    # Download entry point: DB mode rebuilds the full `<trace_id>.jsonl` from the tables; file mode returns
    # the original file on disk. With session_id the file backend builds the <pid>/<sid>/<trace_id>.jsonl
    # path directly for an O(1) lookup and falls back to a full scan on a miss.
    if not project_id or project_id.strip() == "":
        raise HTTPException(
            status_code=400,
            detail="project_id must not be empty; specify a concrete project id",
        )
    content = await backend.export_trace_jsonl(
        project_id, trace_id, session_id=session_id
    )
    if content is None:
        raise HTTPException(status_code=404, detail="trace not found")
    return Response(
        content=content,
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": f'attachment; filename="{trace_id}.jsonl"'
        },
    )
