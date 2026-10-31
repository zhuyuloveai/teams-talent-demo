"""file storage backend: no in-memory index; everything is read from disk live.

Read strategy (no cache, always the latest):
- List / projects: enumerate *.jsonl **file paths** in the fixed two-level layout without reading file contents.
  The trace list only derives {id, sessionId, projectId} from the path; no summary, no sorting,
  no agent/status filtering (the frontend list page does not show them).
- Detail: first builds the <pid>/<sid>/<trace_id>.jsonl path for an O(1) lookup (when session_id
  is absent or misses, falls back to a scoped glob within the project); real LLM requests are read
  directly from llm_request/<event_id>.json by event_id. Real LLM requests are *.json, so the
  `*.jsonl` filter excludes them from the trace index.

Directory layout (written by the SDK):
  <DATA_FILE>/<project_id>/<session_id>/<trace_id>.jsonl               # with session_id
  <DATA_FILE>/<project_id>/_no_session/<trace_id>.jsonl                # without session_id
  <DATA_FILE>/<project_id>/<session_id>/llm_request/<event_id>.json    # real LLM request
"""
from __future__ import annotations

import datetime
import json
import os
from glob import escape
from pathlib import Path
from typing import Any, Iterator

from config import DATA_FILE
from .base import StorageBackend, TraceData

# event_type in JSONL -> type
_EVENT_TRACE = "trace"
_EVENT_SPAN = "span"
_EVENT_OBSERVATION = "observation"
_EVENT_SESSION = "session"
_EVENT_LLM_REQUEST = "llm_request"


class FileBackend(StorageBackend):
    def __init__(self, data_dir: str | Path | None = None):
        self._data_dir = Path(data_dir or DATA_FILE)

    # ---- Live disk reads ----

    def _iter_trace_files(self, root: Path | None = None) -> Iterator[Path]:
        """Enumerate trace file paths in the fixed two-level layout (no content reads, no recursion).

        Layout convention (written by the SDK): <data_dir>/<project_id>/<session_id>/<trace_id>.jsonl.
        So only two scandir calls are needed: project directory -> session directory -> the *.jsonl files in it.

        Why no recursion: the data directory is often bind-mounted from Windows (Docker Desktop uses 9p/drvfs),
        where each directory syscall takes milliseconds, so a full rglob is slowed to 6s+ by deep leftover test directories;
        the standard layout has only two levels, measured at 6.3s -> 0.2s.

        When root is a project subdirectory (<data_dir>/<project_id>) only that project is scanned; when root is None
        the project directories under data_dir are enumerated first. The llm_request directory is on the third level and holds *.json,
        so this method never enters it and it never mixes into the trace list.
        """
        base = root or self._data_dir
        if not base.is_dir():
            return
        project_dirs = [base] if root is not None else self._scandir_dirs(base)
        for project_dir in project_dirs:
            for session_dir in self._scandir_dirs(project_dir):
                for f in self._scandir_trace_files(session_dir):
                    yield f

    @staticmethod
    def _scandir_dirs(path: Path) -> Iterator[Path]:
        """List the direct subdirectories (empty when there are none or the directory is unreadable)."""
        try:
            with os.scandir(path) as it:
                for entry in it:
                    try:
                        if entry.is_dir():
                            yield Path(entry.path)
                    except OSError:
                        continue
        except OSError:
            return

    @staticmethod
    def _scandir_trace_files(path: Path) -> Iterator[Path]:
        """List the *.jsonl files in a directory (non-recursive)."""
        try:
            with os.scandir(path) as it:
                for entry in it:
                    if not entry.name.endswith(".jsonl"):
                        continue
                    try:
                        if entry.is_file():
                            yield Path(entry.path)
                    except OSError:
                        continue
        except OSError:
            return

    def _read_trace_file(self, path: Path) -> list[dict[str, Any]]:
        """Read all event lines of one trace file (for detail; read from disk every time to stay current)."""
        events: list[dict[str, Any]] = []
        try:
            with open(path, encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        ev = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    events.append(ev)
        except OSError:
            pass
        return events

    def _find_trace_file(self, trace_id: str, project_id: str, session_id: str | None) -> Path | None:
        """Fallback lookup within the given project; when a session is given, also limit to that session directory.

        Nested legacy directories inside the project are still readable, but a direct path miss must not read other projects;
        and an explicit session_id that does not match must not fall back to other sessions of the same project.
        """
        root = self._data_dir / project_id
        if not project_id or not root.is_dir():
            return None
        trace_pattern = escape(trace_id) + ".jsonl"
        pattern = f"**/{escape(session_id)}/{trace_pattern}" if session_id else f"**/{trace_pattern}"
        for f in root.glob(pattern):
            return f
        return None

    def _trace_file_at(
        self, project_id: str, session_id: str | None, trace_id: str
    ) -> Path | None:
        """Locate by building the <pid>/<sid>/<trace_id>.jsonl path directly (O(1), no traversal).

        An empty session_id maps to the _no_session directory. Returns the path when found, otherwise None (the caller
        falls back to _find_trace_file within the project, covering legacy directories/manually moved files).
        """
        sid = session_id if session_id else "_no_session"
        p = self._data_dir / project_id / sid / f"{trace_id}.jsonl"
        return p if p.is_file() else None

    def _find_llm_request(self, project_id: str, event_id: str) -> dict[str, Any] | None:
        """Read llm_request/<event_id>.json directly by project_id + event_id (one file per event).

        The SDK writes to <data_dir>/<pid>/<sid>/llm_request/<event_id>.json,
        and the file name is the event_id. project_id sets the scan root: under <data_dir>/<project_id>
        the glob reads on a file name match, limiting traversal to the given project and avoiding a full scan
        (leftover project directories such as sess-bench from benchmarks no longer slow this query).
        """
        root = self._data_dir / project_id
        if not root.is_dir():
            return None
        for f in root.glob(f"**/llm_request/{event_id}.json"):
            try:
                with open(f, encoding="utf-8") as fh:
                    ev = json.load(fh)
            except (json.JSONDecodeError, OSError):
                continue
            if isinstance(ev, dict):
                return ev
        return None

    # ---- Unified query interface ----

    def _project_roots(self, project_id: str) -> Path | None:
        """Resolve the scan root directory for project_id (comma-separated values allowed).

        None means no project was given: scan all project directories under data_dir and let the caller
        filter by project_id; several projects also return None (data_dir is the shared root).
        """
        if not project_id:
            return None
        pids = [p for p in project_id.split(",") if p]
        if len(pids) == 1:
            return self._data_dir / pids[0]
        return None

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
        """Trace list: lists *.jsonl file paths only, without reading file contents.

        The returned {id, project_id, session_id} fields all come from the path (snake_case,
        same as the database backend, read directly by trace_out in the route):
          <data_dir>/<project_id>/<session_id>/<trace_id>.jsonl (_no_session/ when there is no session)
        Scans the fixed two-level layout (see _iter_trace_files): leftover directories at non-standard depth
        (such as <pid>/<case>/<pid>/<sid>/<trace_id>.jsonl written by test cases) do not appear in
        the list, but detail/export can still find them by trace_id through the full-scan fallback.

        The list page shows no summary, does not sort and does not filter by agent/status, so the agent_name/status
        parameters only exist for the base class signature and are ignored here (the frontend no longer sends them).
        """
        roots = self._project_roots(project_id)
        items: list[dict[str, Any]] = []
        for f in self._iter_trace_files(roots):
            parts = f.relative_to(self._data_dir).parts
            pid = parts[0] if len(parts) > 0 else "default"
            sid = parts[1] if len(parts) > 1 else ""
            tid = f.stem  # File name without .jsonl is the trace_id
            # Skip non-trace files (such as the _no_trace fallback directory, projects.json, etc.)
            if not tid or tid.startswith("_") or pid.startswith("_"):
                continue
            items.append({"id": tid, "project_id": pid, "session_id": sid})
        # project_id accepts comma-separated values
        if project_id:
            allowed = set(project_id.split(","))
            items = [t for t in items if t["project_id"] in allowed]
        # Keyword: return when either trace_id or session_id matches (OR semantics, plain string match)
        if session_id or trace_id:
            items = [
                t for t in items
                if (trace_id and trace_id in t["id"])
                or (session_id and session_id in t["session_id"])
            ]
        total = len(items)
        start = (page - 1) * page_size
        page_items = items[start : start + page_size]
        return page_items, total

    async def get_trace_detail(
        self,
        project_id: str,
        trace_id: str,
        session_id: str | None = None,
    ) -> TraceData | None:
        # Lazily read a single file: each read gets the latest data (newly appended span/obs included).
        # With session_id, build the <pid>/<sid>/<trace_id>.jsonl path directly (O(1));
        # on a miss (legacy directory/manually moved) fall back to a scoped glob within the project.
        path: Path | None = None
        if project_id:
            path = self._trace_file_at(project_id, session_id, trace_id)
        if path is None:
            path = self._find_trace_file(trace_id, project_id, session_id)
        if path is None:
            return None
        events = self._read_trace_file(path)
        trace = self._pick_trace_event(events, trace_id)
        spans: list[dict[str, Any]] = []
        obs: list[dict[str, Any]] = []
        for ev in events:
            if ev.get("event_type") == _EVENT_SPAN and str(ev.get("trace_id")) == trace_id:
                spans.append(ev)
            elif ev.get("event_type") == _EVENT_OBSERVATION and str(ev.get("trace_id")) == trace_id:
                obs.append(ev)
        # OTLP retransmission/batched appends may repeat a span; detail and call tree use the same deduplicated projection.
        # id is the span identity and event_id only identifies the event, so the span count cannot be the line count.
        spans = self._unique_spans(spans)
        if trace is None:
            # Fallback: when the SDK process is killed or loses a batch before the root run ends, the file may have no
            # trace summary event (only session/span/observation). In that case build a minimal trace record
            # from the events in the file, so detail/call tree stay readable and
            # collected span/obs can still be shown without the summary event.
            trace = self._synthesize_trace(events, spans, trace_id)
        if trace is None:
            return None
        trace = dict(trace)
        # The counts on the root trace line only cover its own OTLP batch. Detail has read the whole file,
        # so count the identifiable spans; batch summaries are not added up and token usage is not estimated.
        identified = all(span.get("id") for span in spans)
        trace["span_count"] = len(spans) if identified else None
        known_types = {"chain", "llm", "tool", "retriever", "agent", "span"}
        trace["tool_count"] = (
            sum(span.get("span_type") == "tool" for span in spans)
            if identified and all(span.get("span_type") in known_types for span in spans)
            else None
        )
        return TraceData(trace=trace, spans=spans, observations=obs)

    @staticmethod
    def _unique_spans(spans: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Keep the last record of each span; records without an identity are kept and not deduplicated by guesswork."""
        result: list[dict[str, Any]] = []
        positions: dict[str, int] = {}
        for span in spans:
            span_id = span.get("id")
            if span_id:
                key = str(span_id)
                if key in positions:
                    result[positions[key]] = span
                    continue
                positions[key] = len(result)
            result.append(span)
        return result

    async def export_trace_jsonl(
        self,
        project_id: str,
        trace_id: str,
        session_id: str | None = None,
    ) -> str | None:
        """Restore and download: file mode needs no restoring; the <trace_id>.jsonl on disk is the original.

        Builds <pid>/<sid>/<trace_id>.jsonl from project_id + session_id + trace_id
        for an O(1) lookup (_no_session when session_id is empty), falls back to a scoped glob within the project on a miss,
        and returns the found file unchanged (only database mode needs to rebuild rows from tables).
        """
        path: Path | None = None
        if project_id:
            path = self._trace_file_at(project_id, session_id, trace_id)
        if path is None:
            path = self._find_trace_file(trace_id, project_id, session_id)
        if path is None:
            return None
        try:
            return path.read_text(encoding="utf-8")
        except OSError:
            return None

    def _pick_trace_event(
        self, events: list[dict[str, Any]], trace_id: str
    ) -> dict[str, Any] | None:
        """Pick this trace's trace summary event from the file's event lines (None if there is none).

        A trace can have several trace events: during OTLP reporting, a child span arriving first writes a
        shallow placeholder (only id/event_id/project_id/status), and the root span writes the
        complete one when it arrives. Database mode overwrites with ON CONFLICT DO UPDATE, but file mode
        is append-only with no overwrite, so the most complete one must be picked here; otherwise the detail page
        would read a placeholder with only status (name/duration/tokens all null).
        """
        best: dict[str, Any] | None = None
        best_score = -1
        for ev in events:
            if ev.get("event_type") != _EVENT_TRACE:
                continue
            tid = ev.get("trace_id") or ev.get("id")
            if str(tid) != str(trace_id):
                continue
            ev.setdefault("id", str(tid))
            # Shallow placeholders are explicitly marked trace_insert_only; others are scored by the number of filled fields
            score = sum(
                1
                for key in ("name", "duration_ms", "total_tokens", "agent_name", "input", "output")
                if ev.get(key) not in (None, "", 0)
            )
            if ev.get("trace_insert_only") is True:
                score = -1
            if score > best_score:
                best, best_score = ev, score
        return best

    def _synthesize_trace(
        self,
        events: list[dict[str, Any]],
        spans: list[dict[str, Any]],
        trace_id: str,
    ) -> dict[str, Any] | None:
        """Build a minimal trace record from the events in an incomplete file (fallback when the trace summary event is missing).

        When it happens: the SDK process is killed / loses a batch before the root run ends, so the file only has
        session/span/observation and no trace summary event. The existing events are used to restore as much as possible of
        the display fields such as project_id/session_id/name/agent_name/time; statistics that
        cannot be restored get defaults, so detail and call tree can still show the collected span/obs.
        """
        tid = str(trace_id)
        pid: str | None = None
        sid: str | None = None
        name: str | None = None
        agent_name: str | None = None
        started_at: str | None = None
        created_at: str | None = None
        tool_count = 0
        # The root span (empty parent_span_id) provides display info first
        root_span: dict[str, Any] | None = None
        for ev in events:
            etype = ev.get("event_type")
            if str(ev.get("trace_id")) != tid:
                continue
            if etype == _EVENT_SESSION:
                pid = ev.get("project_id") or pid
                sid = ev.get("session_id") or sid
                created_at = ev.get("created_at") or created_at
                name = ev.get("name") or name
            elif etype == _EVENT_SPAN:
                pid = ev.get("project_id") or pid
                sid = ev.get("session_id") or sid
                created_at = ev.get("created_at") or created_at
                started_at = ev.get("started_at") or started_at
                if ev.get("tool_name"):
                    tool_count += 1
                if (ev.get("parent_span_id") in (None, "") and root_span is None):
                    root_span = ev
        if root_span is not None:
            name = root_span.get("name") or name
            meta = root_span.get("metadata")
            if isinstance(meta, dict):
                agent_name = meta.get("lc_agent_name")
        duration_ms = self._span_chain_duration_ms(root_span, spans)
        return {
            "id": tid,
            "event_id": None,
            "project_id": pid or "default",
            "session_id": sid,
            "name": name,
            "agent_name": agent_name,
            "input": None,
            "output": None,
            "duration_ms": duration_ms,
            "total_tokens": None,
            "prompt_tokens": None,
            "completion_tokens": None,
            "react_step_count": 0,
            "tool_count": tool_count,
            "span_count": len(spans),
            "status": "success",
            "error_info": None,
            "started_at": started_at or created_at,
            "created_at": created_at,
        }

    @staticmethod
    def _parse_ts(value: Any) -> float | None:
        """Convert an ISO time string to epoch seconds (None if parsing fails)."""
        if not isinstance(value, str):
            return None
        try:
            return datetime.datetime.fromisoformat(
                value.replace("Z", "+00:00")
            ).timestamp()
        except (ValueError, TypeError):
            return None

    def _span_chain_duration_ms(
        self, root_span: dict[str, Any] | None, spans: list[dict[str, Any]]
    ) -> int:
        """Estimate duration_ms from the root span start to the deepest span end (0 when missing)."""
        if root_span is None:
            return 0
        s0 = self._parse_ts(root_span.get("started_at"))
        if s0 is None:
            return 0
        max_end = s0
        for s in spans:
            st = self._parse_ts(s.get("started_at"))
            d = s.get("duration_ms")
            if st is None or not isinstance(d, (int, float)):
                continue
            if st + d / 1000.0 > max_end:
                max_end = st + d / 1000.0
        return int(round((max_end - s0) * 1000))

    async def get_llm_request(
        self, project_id: str, event_id: str
    ) -> dict[str, Any] | None:
        return self._find_llm_request(project_id, event_id)

if __name__ == "__main__":
    list_traces("demo", 1, 20)
