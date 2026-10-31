"""Trace/Span/Observation repository: wraps the list, detail and call tree queries.

Project management (projects CRUD / agents) is retired: project IDs come from the integrator/reporter.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import String, and_, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import LlmRequest, Observation, Session, Span, Trace


class TraceRepository:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def list_traces(
        self,
        project_id: str,
        page: int = 1,
        page_size: int = 20,
        agent_name: str | None = None,
        status: str | None = None,
        session_id: str | None = None,
        trace_id: str | None = None,
    ) -> tuple[list[Trace], int]:
        """Query traces with pagination; returns (rows, total).

        project_id accepts several comma-separated project IDs.
        """
        conds: list = []
        if project_id:
            conds.append(Trace.project_id.in_(project_id.split(",")))
        if agent_name:
            conds.append(Trace.agent_name == agent_name)
        if status:
            conds.append(Trace.status == status)
        # session_id / trace_id support fuzzy substring matching (one input box can search any ID).
        # They are ORed: a keyword returns rows matching either trace_id or session_id.
        # UUID columns must be cast to text before ILIKE (PostgreSQL does not support uuid ~~* uuid)
        if session_id or trace_id:
            keyword = session_id or trace_id
            conds.append(
                or_(
                    cast(Trace.session_id, String).ilike(f"%{keyword}%"),
                    cast(Trace.id, String).ilike(f"%{keyword}%"),
                )
            )
        cond = and_(*conds)

        total = await self._session.scalar(select(func.count()).select_from(Trace).where(cond)) or 0
        stmt = (
            select(Trace)
            .where(cond)
            .order_by(Trace.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = (await self._session.scalars(stmt)).all()
        return list(rows), total

    async def get_trace(self, project_id: str, trace_id: str) -> Trace | None:
        """Look up a trace by id; no project filter when project_id is empty."""
        stmt = select(Trace).where(Trace.id == trace_id)
        if project_id:
            stmt = stmt.where(Trace.project_id.in_(project_id.split(",")))
        return await self._session.scalar(stmt)

    async def get_spans(self, trace_id: str) -> list[Span]:
        stmt = select(Span).where(Span.trace_id == trace_id).order_by(Span.created_at)
        return list((await self._session.scalars(stmt)).all())

    async def get_observations(self, trace_id: str) -> list[Observation]:
        stmt = (
            select(Observation)
            .where(Observation.trace_id == trace_id)
            .order_by(Observation.created_at)
        )
        return list((await self._session.scalars(stmt)).all())

    async def get_span(self, span_id: str) -> Span | None:
        """Read one row by the spans.id primary key (PK hit, a few rows of cost)."""
        return await self._session.scalar(select(Span).where(Span.id == span_id))

    async def get_observations_by_span(self, span_id: str) -> list[Observation]:
        """Uses the idx_observations_span(span_id) index."""
        stmt = (
            select(Observation)
            .where(Observation.span_id == span_id)
            .order_by(Observation.created_at)
        )
        return list((await self._session.scalars(stmt)).all())

    async def get_token_totals(
        self, trace_ids: list[str]
    ) -> dict[str, dict[str, int]]:
        """Aggregate observation token usage per trace_id on the fly.

        Returns {trace_id: {"prompt_tokens": n, "completion_tokens": n,
        "total_tokens": n}}. Observations reported across processes/sub-agents are all counted,
        so the SDK's single-process total_tokens sum does not miss any (see the multi-source design).
        total_tokens is the sum of the raw column values (a model may count cache/system overhead in total but not in
        prompt/completion, so total != prompt + completion is normal).
        """
        if not trace_ids:
            return {}
        rows = await self._session.execute(
            select(
                Observation.trace_id,
                func.coalesce(func.sum(Observation.prompt_tokens), 0),
                func.coalesce(func.sum(Observation.completion_tokens), 0),
                func.coalesce(func.sum(Observation.total_tokens), 0),
            )
            .where(Observation.trace_id.in_(trace_ids))
            .group_by(Observation.trace_id)
        )
        return {
            str(trace_id): {
                "prompt_tokens": int(prompt or 0),
                "completion_tokens": int(completion or 0),
                "total_tokens": int(total or 0),
            }
            for trace_id, prompt, completion, total in rows.all()
        }

    async def get_llm_request(self, project_id: str, event_id: str) -> LlmRequest | None:
        """Read one real LLM request by the project_id + event_id primary key.

        The llm_requests table stores project_id redundantly (not derived via join); the SQL adds
        a WHERE project_id = ? filter, matching how file mode narrows the scan to the project directory.
        """
        row = await self._session.execute(
            select(LlmRequest).where(
                and_(LlmRequest.event_id == event_id,
                     LlmRequest.project_id == project_id)
            )
        )
        return row.scalar_one_or_none()

    async def get_session(self, session_id: str) -> Session | None:
        """Read one session by the sessions.id primary key (used to rebuild session event rows on export)."""
        return await self._session.scalar(select(Session).where(Session.id == session_id))
