"""ORM models: one to one with the trace tables in db/schema.sql (domain model layer of the Repository Pattern).

Column types are portable across dialects:
- UUID columns use UUID36 (a native UUID column on PG, bound parameters are converted to uuid;
  VARCHAR(36) on MySQL storing hyphenated UUID strings, matching CHAR(36) in schema_mysql.sql)
- JSON columns use JSON (JSONB on PG, JSON on MySQL)

Note: project management has been removed; project_id is only a data isolation dimension supplied by the integrator (no foreign key,
no projects table), so no Project model is mapped here; it is any string (e.g. l0/l1/l2),
VARCHAR(64) in SQL (same on PG/MySQL), so it maps to String(64) rather than UUID36.

Note: like db/schema.sql / schema_mysql.sql, **no table-level foreign keys are declared**: daily partitioning
requires child tables not to REFERENCE partitioned parents, and FK checks take shared locks on parent rows, causing write contention.
session_id / trace_id / span_id are plain columns; referential integrity is ensured by the consumer's
ensure_* placeholders and query filters (this module does not create tables; it only maps ORM queries).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Column,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Cross-dialect UUID column: PG stores a native uuid column (Uuid binding converts to uuid, avoiding uuid=varchar errors),
# MySQL stores a hyphenated VARCHAR(36) string (same meaning as CHAR(36) in schema_mysql.sql).
UUID36 = String(36).with_variant(Uuid, "postgresql")


class Base(DeclarativeBase):
    pass


class Session(Base):
    __tablename__ = "sessions"

    # id is VARCHAR: session_id means the same as in langfuse (any string, e.g. sess-xxx)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(64))
    name: Mapped[str | None] = mapped_column(String(255))
    user_id: Mapped[str | None] = mapped_column(String(255))
    metadata_json: Mapped[dict | None] = Column("metadata", JSON)
    trace_count: Mapped[int] = mapped_column(Integer, server_default="0")
    total_tokens: Mapped[int] = mapped_column(BigInteger, server_default="0")
    total_duration_ms: Mapped[int] = mapped_column(BigInteger, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (Index("idx_sessions_project", "project_id", "created_at"),)


class Trace(Base):
    __tablename__ = "traces"

    id: Mapped[str] = mapped_column(UUID36, primary_key=True)
    event_id: Mapped[str] = mapped_column(UUID36, unique=True)
    project_id: Mapped[str] = mapped_column(String(64))
    session_id: Mapped[str | None] = mapped_column(String(64))
    name: Mapped[str | None] = mapped_column(String(255))
    agent_name: Mapped[str | None] = mapped_column(String(255))
    input: Mapped[dict | None] = mapped_column(JSON)
    output: Mapped[dict | None] = mapped_column(JSON)
    duration_ms: Mapped[int | None] = mapped_column(BigInteger)
    react_step_count: Mapped[int] = mapped_column(Integer, server_default="0")
    tool_count: Mapped[int] = mapped_column(Integer, server_default="0")
    span_count: Mapped[int] = mapped_column(Integer, server_default="0")
    status: Mapped[str] = mapped_column(String(20), server_default="success")
    error_info: Mapped[dict | None] = mapped_column(JSON)
    started_at: Mapped[datetime | None] = mapped_column(DateTime())
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_traces_project_time", "project_id", "created_at"),
        Index("idx_traces_session", "session_id"),
    )


class Span(Base):
    __tablename__ = "spans"

    id: Mapped[str] = mapped_column(UUID36, primary_key=True)
    event_id: Mapped[str] = mapped_column(UUID36, unique=True)
    project_id: Mapped[str] = mapped_column(String(64))
    trace_id: Mapped[str] = mapped_column(UUID36)
    parent_span_id: Mapped[str | None] = mapped_column(UUID36)
    name: Mapped[str] = mapped_column(String(255))
    span_type: Mapped[str] = mapped_column(String(20))
    input: Mapped[dict | None] = mapped_column(JSON)
    output: Mapped[dict | None] = mapped_column(JSON)
    duration_ms: Mapped[int | None] = mapped_column(BigInteger)
    model: Mapped[str | None] = mapped_column(String(255))
    tool_name: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), server_default="success")
    error_info: Mapped[dict | None] = mapped_column(JSON)
    started_at: Mapped[datetime | None] = mapped_column(DateTime())
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_spans_trace", "trace_id", "created_at"),
        Index("idx_spans_parent", "parent_span_id"),
        Index("idx_spans_project_time", "project_id", "created_at"),
    )


class Observation(Base):
    __tablename__ = "observations"

    id: Mapped[str] = mapped_column(UUID36, primary_key=True)
    event_id: Mapped[str] = mapped_column(UUID36, unique=True)
    project_id: Mapped[str] = mapped_column(String(64))
    trace_id: Mapped[str] = mapped_column(UUID36)
    span_id: Mapped[str | None] = mapped_column(UUID36)
    model: Mapped[str | None] = mapped_column(String(255))
    prompt_tokens: Mapped[int] = mapped_column(Integer, server_default="0")
    completion_tokens: Mapped[int] = mapped_column(Integer, server_default="0")
    total_tokens: Mapped[int] = mapped_column(Integer, server_default="0")
    input: Mapped[dict | None] = mapped_column(JSON)
    output: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("idx_observations_span", "span_id", "created_at"),
        Index("idx_observations_trace", "trace_id", "created_at"),
    )


class LlmRequest(Base):
    """Real LLM request (captured by middleware; event_id links it to the llm span).

    Matches the llm_requests table in db/schema.sql: event_id primary key (idempotent),
    input/output are the real request/response payloads.
    """

    __tablename__ = "llm_requests"

    event_id: Mapped[str] = mapped_column(UUID36, primary_key=True)
    id: Mapped[str] = mapped_column(UUID36)
    project_id: Mapped[str] = mapped_column(String(64))
    trace_id: Mapped[str] = mapped_column(UUID36)
    span_id: Mapped[str | None] = mapped_column(UUID36)
    model: Mapped[str | None] = mapped_column(String(256))
    input: Mapped[dict] = mapped_column(JSON)
    output: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(16), server_default="success")
    error_info: Mapped[dict | None] = mapped_column(JSON)
    started_at: Mapped[datetime | None] = mapped_column(DateTime())
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_llm_requests_trace", "trace_id"),
        Index("idx_llm_requests_span", "span_id"),
    )
