"""Pydantic response models: convert database snake_case fields to frontend camelCase."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ConfigOut(BaseModel):
    storageBackend: str


class ErrorInfoOut(BaseModel):
    errorType: str | None = None
    errorCode: str | None = None
    errorCategory: str | None = None
    message: str | None = None
    stackTrace: str | None = None


class TraceOut(BaseModel):
    id: str
    eventId: str | None = None
    projectId: str
    sessionId: str | None = None
    name: str | None = None
    agentName: str | None = None
    input: Any | None = None
    output: Any | None = None
    durationMs: int | None = None
    totalTokens: int | None = None
    promptTokens: int | None = None
    completionTokens: int | None = None
    reactStepCount: int | None = None
    toolCount: int | None = None
    spanCount: int | None = None
    status: str
    errorInfo: ErrorInfoOut | None = None
    startedAt: str | None = None


class SpanOut(BaseModel):
    id: str
    eventId: str | None = None
    traceId: str
    parentSpanId: str | None = None
    name: str
    spanType: str
    input: Any | None = None
    output: Any | None = None
    durationMs: int | None = None
    model: str | None = None
    toolName: str | None = None
    status: str
    errorInfo: ErrorInfoOut | None = None
    startedAt: str | None = None


class SpanBriefOut(BaseModel):
    """Lightweight tree node: no input/output/errorInfo (fetched individually on click).

    eventId / parentSpanId must be kept: the former drives Real LLM Request lazy loading,
    the latter lets build_tree assemble the tree.
    """

    id: str
    eventId: str | None = None
    traceId: str
    parentSpanId: str | None = None
    name: str
    spanType: str
    durationMs: int | None = None
    model: str | None = None
    toolName: str | None = None
    status: str
    startedAt: str | None = None


class LlmRequestOut(BaseModel):
    eventId: str
    spanId: str | None = None
    model: str | None = None
    input: Any | None = None
    output: Any | None = None
    status: str | None = None
    errorInfo: ErrorInfoOut | None = None
    startedAt: str | None = None


class ObservationOut(BaseModel):
    """Compact observation view: input/output have no frontend consumers, so they are not sent."""

    id: str
    spanId: str | None = None
    model: str | None = None
    promptTokens: int | None = None
    completionTokens: int | None = None
    totalTokens: int | None = None


class SpanDetailOut(BaseModel):
    """Full detail returned on demand when a node is clicked: all span fields + its observations."""

    span: SpanOut
    observations: list[ObservationOut] = Field(default_factory=list)


class TraceNodeOut(BaseModel):
    # Union type (not SpanBriefOut): /tree in DB mode passes SpanBriefOut, file mode
    # still passes full SpanOut. Pydantic v2 does not accept a parent-class instance as a subclass, so declaring only
    # SpanBriefOut here would make file-mode /tree fail with a ValidationError (500).
    span: SpanBriefOut | SpanOut | None = None
    children: list[TraceNodeOut] = Field(default_factory=list)


class TraceListOut(BaseModel):
    items: list[TraceOut]
    total: int
    page: int
    page_size: int


class TraceDetailOut(BaseModel):
    trace: TraceOut
    spans: list[SpanOut]
    observations: list[ObservationOut]


class TraceTreeOut(BaseModel):
    trace: TraceOut
    tree: list[TraceNodeOut]
