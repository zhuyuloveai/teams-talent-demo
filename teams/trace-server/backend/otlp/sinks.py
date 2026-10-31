"""Sinks for events received over OTLP.

Design points (see §8 of the OTLP endpoint ingestion design doc):
- `offer()` only enqueues in memory and **never awaits network/disk**, so HTTP responses are never blocked by downstream
- Queue full => `offer()` returns False and the route returns 503, so the OTel SDK backs off and retries itself
- A background task takes batches + `_write_batch()`; write failures are only logged, **no retry, no requeue**
  (retries are left to the client; retrying here would only amplify duplicates)
- `stop()` is called on lifespan shutdown and flushes what is left

Sinks: `kafka` (default, durable and replayable) / `redis` / `file` / `none`.
When downstream is unreachable the sink does not exit; it is marked "not ready" and reconnects in the background. While not ready,
`offer()` returns False -> 503 from the route; no server restart is needed once downstream recovers.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Callable

logger = logging.getLogger("trace_server.otlp.sink")

_UNSAFE = re.compile(r"[^0-9A-Za-z_\-\.]")
_LONG_PATH_PREFIX = "\\\\?\\"


def _safe_segment(value: Any, fallback: str) -> str:
    if value in (None, ""):
        return fallback
    cleaned = _UNSAFE.sub("_", str(value))
    return cleaned or fallback


def _long_path(path: Path) -> Path:
    """Add the \\\\?\\ prefix for long Windows paths (same practice as FileExporter)."""
    text = str(path)
    if os.name != "nt" or text.startswith(_LONG_PATH_PREFIX) or len(text) < 200:
        return path
    if text.startswith("\\\\"):
        return Path("\\\\?\\UNC\\" + text[2:])
    return Path(_LONG_PATH_PREFIX + text)


class BaseSink(ABC):
    """Common skeleton of all sinks: bounded queue + background batch flushing."""

    # Whether a write failure means the downstream connection is gone; if True, mark not ready and reconnect in the background;
    # meanwhile offer() returns False (503) instead of accepting events and silently dropping them
    _mark_unready_on_failure = False

    def __init__(
        self,
        *,
        maxsize: int = 10000,
        batch_size: int = 200,
        flush_interval: float = 1.0,
        reconnect_interval: float = 5.0,
    ) -> None:
        self._q: asyncio.Queue[list[dict[str, Any]]] = asyncio.Queue(maxsize=maxsize)
        self._batch_size = max(1, batch_size)
        self._flush_interval = max(0.05, flush_interval)
        self._reconnect_interval = max(0.2, reconnect_interval)
        self._task: asyncio.Task[None] | None = None
        self._closed = False
        # Whether downstream is available; when False offer() rejects (503 from the route) and reconnects in the background at an interval
        self._ready = True
        self.dropped_batches = 0
        self.write_failures = 0

    # ---- Lifecycle ----

    async def start(self) -> None:
        """Connect to downstream (subclasses may override); failures do not raise, they only degrade to rejecting."""
        await self._on_start()
        self._closed = False
        self._task = asyncio.create_task(self._run(), name="otlp-sink")

    async def _on_start(self) -> None:  # pragma: no cover - no-op by default
        return

    async def _reconnect(self) -> None:  # pragma: no cover - no-op by default
        """Reconnect attempt when downstream is unreachable; implemented by subclasses."""
        return

    async def stop(self) -> None:
        self._closed = True
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None
        # Flush the events left in the queue
        while not self._q.empty():
            try:
                batch = self._q.get_nowait()
            except asyncio.QueueEmpty:  # pragma: no cover
                break
            try:
                await self._write_batch(batch)
            except Exception:
                logger.warning("OTLP sink failed to flush remaining events on shutdown", exc_info=True)
        await self._on_stop()

    async def _on_stop(self) -> None:  # pragma: no cover - no-op by default
        return

    # ---- Delivery ----

    def offer(self, events: list[dict[str, Any]]) -> bool:
        """Non-blocking enqueue; returns False when the queue is full or downstream is unavailable (the caller then returns 503)."""
        if not events:
            return True
        if self._closed or not self._ready:
            return False
        try:
            self._q.put_nowait(events)
            return True
        except asyncio.QueueFull:
            self.dropped_batches += 1
            logger.warning(
                "OTLP sink queue is full (%d batches rejected); returning 503 so the client retries",
                self.dropped_batches,
            )
            return False

    # ---- Background loop ----

    async def _run(self) -> None:
        pending: list[dict[str, Any]] = []
        while True:
            try:
                if not self._ready:
                    # Downstream unreachable: do not consume the queue (it fills up -> 503 makes the client back off)
                    await asyncio.sleep(self._reconnect_interval)
                    await self._reconnect()
                    continue

                batch = await asyncio.wait_for(
                    self._q.get(), timeout=self._flush_interval
                )
                pending.extend(batch)
                # Write out once one or more batches have accumulated
                while not self._q.empty() and len(pending) < self._batch_size * 5:
                    try:
                        pending.extend(self._q.get_nowait())
                    except asyncio.QueueEmpty:
                        break
                if pending:
                    await self._flush(pending)
                    pending = []
            except asyncio.TimeoutError:
                if pending:
                    await self._flush(pending)
                    pending = []
            except asyncio.CancelledError:
                raise
            except Exception:  # pragma: no cover - defensive
                logger.exception("OTLP sink background loop error")
                await asyncio.sleep(0.5)

    async def _flush(self, events: list[dict[str, Any]]) -> None:
        try:
            await self._write_batch(events)
        except Exception:
            self.write_failures += 1
            logger.exception(
                "OTLP sink write failed; dropping %d events (client retries cover this)", len(events)
            )
            if self._mark_unready_on_failure:
                # Downstream connection is gone: stop the old connection, mark not ready, and let the background loop reconnect;
                # meanwhile offer() returns False -> 503, and the client resends this batch
                self._ready = False
                try:
                    await self._on_stop()
                except Exception:  # pragma: no cover - cleanup failure does not affect the flow
                    logger.warning("OTLP sink failed to clean up after disconnect", exc_info=True)

    @abstractmethod
    async def _write_batch(self, events: list[dict[str, Any]]) -> None:
        """Write a batch of events downstream. Raise on failure; the base class handles counting and logging."""


class NilSink(BaseSink):
    """Accepts but never writes: for load testing / protocol-only checks."""

    async def _write_batch(self, events: list[dict[str, Any]]) -> None:
        return


class FileSink(BaseSink):
    """Writes JSONL with exactly the same directory layout as `trace_sdk.FileExporter`:

        <root>/<project_id>/<session_id>/<trace_id>.jsonl
        <root>/<project_id>/_no_session/<trace_id>.jsonl

    so `FileBackend` can read it back without any change.
    """

    def __init__(
        self,
        root: str | Path,
        *,
        maxsize: int = 10000,
        batch_size: int = 200,
        flush_interval: float = 1.0,
        max_handles: int = 512,
    ) -> None:
        super().__init__(
            maxsize=maxsize, batch_size=batch_size, flush_interval=flush_interval
        )
        self._root = Path(root)
        self._handles: dict[str, Any] = {}
        self._handle_order: list[str] = []
        self._max_handles = max(1, max_handles)
        # trace_id -> session_id: observation events carry no session_id and are filed under their trace's directory;
        # otherwise one trace would split into two files under <sid>/ and _no_session/ (same as FileExporter).
        self._trace_session: dict[str, str] = {}

    async def _on_start(self) -> None:
        try:
            self._root.mkdir(parents=True, exist_ok=True)
        except OSError:
            logger.exception("OTLP FileSink cannot create directory %s", self._root)

    def _path_for(self, ev: dict[str, Any]) -> Path | None:
        etype = ev.get("event_type")
        trace_id = ev.get("trace_id") or ev.get("id")
        if not trace_id and etype != "session":
            return None
        project_id = _safe_segment(ev.get("project_id"), "default")
        trace_seg = _safe_segment(trace_id, "unknown")
        session_id = ev.get("session_id")
        # session / trace events carry session_id: build the trace -> session mapping
        # so later span / observation events without session_id go into the same directory.
        if session_id and etype in ("session", "trace") and trace_id:
            self._trace_session[str(trace_id)] = str(session_id)
        elif not session_id and trace_id:
            session_id = self._trace_session.get(str(trace_id))
        if session_id:
            session_seg = _safe_segment(session_id, "unknown")
            return self._root / project_id / session_seg / f"{trace_seg}.jsonl"
        return self._root / project_id / "_no_session" / f"{trace_seg}.jsonl"

    def _handle(self, path: Path) -> Any:
        path = _long_path(path)
        key = str(path)
        handle = self._handles.get(key)
        if handle is not None:
            if key in self._handle_order:
                self._handle_order.remove(key)
            self._handle_order.append(key)
            return handle

        while len(self._handles) >= self._max_handles and self._handle_order:
            old_key = self._handle_order.pop(0)
            old = self._handles.pop(old_key, None)
            if old is not None:
                try:
                    old.close()
                except OSError:
                    pass

        path.parent.mkdir(parents=True, exist_ok=True)
        handle = path.open("a", encoding="utf-8")
        self._handles[key] = handle
        self._handle_order.append(key)
        return handle

    async def _write_batch(self, events: list[dict[str, Any]]) -> None:
        written = 0
        for ev in events:
            path = self._path_for(ev)
            if path is None:
                continue
            try:
                line = json.dumps(ev, ensure_ascii=False, default=str) + "\n"
                self._handle(path).write(line)
                written += 1
            except OSError:
                self.write_failures += 1
                self._ready = False
                logger.exception("OTLP FileSink write failed: %s", path)
        for handle in self._handles.values():
            try:
                handle.flush()
            except (OSError, ValueError):
                self.write_failures += 1
                self._ready = False
                logger.exception("OTLP FileSink flush failed")
        if written:
            logger.debug("OTLP FileSink wrote %d events", written)

    async def _on_stop(self) -> None:
        for handle in self._handles.values():
            try:
                handle.close()
            except (OSError, ValueError):
                pass
        self._handles.clear()
        self._handle_order.clear()


class KafkaSink(BaseSink):
    """Delivers to Kafka with exactly the same message body as `trace_sdk.KafkaExporter` (JSON value).

    `key = trace_id` puts all events of a trace in the same partition, which preserves order;
    `acks=all` + `enable_idempotence` prevent loss and duplicates (retransmissions are still covered by the event_id from §6.2).
    """

    _mark_unready_on_failure = True

    def __init__(
        self,
        *,
        bootstrap: str,
        topic: str = "trace_topic",
        acks: str = "all",
        maxsize: int = 10000,
        batch_size: int = 200,
        flush_interval: float = 1.0,
        reconnect_interval: float = 5.0,
        connect_timeout: float = 10.0,
        producer_factory: Callable[[], Any] | None = None,
    ) -> None:
        super().__init__(
            maxsize=maxsize,
            batch_size=batch_size,
            flush_interval=flush_interval,
            reconnect_interval=reconnect_interval,
        )
        self._bootstrap = bootstrap
        self._topic = topic
        self._acks = acks
        self._connect_timeout = max(0.5, connect_timeout)
        self._producer: Any = None
        self._producer_factory = producer_factory

    def _new_producer(self) -> Any:
        if self._producer_factory is not None:
            return self._producer_factory()
        from aiokafka import AIOKafkaProducer

        return AIOKafkaProducer(
            bootstrap_servers=self._bootstrap,
            acks=self._acks,
            enable_idempotence=self._acks == "all",
            value_serializer=lambda v: json.dumps(v, ensure_ascii=False).encode(),
            key_serializer=lambda k: k.encode() if k else None,
        )

    async def _on_start(self) -> None:
        producer = None
        try:
            producer = self._new_producer()
            # When the broker is unreachable aiokafka may hang in retries for a long time, so a timeout is required;
            # otherwise server startup would stall (in that case degrade to rejecting)
            await asyncio.wait_for(producer.start(), timeout=self._connect_timeout)
        except Exception:
            self._ready = False
            self._producer = None
            if producer is not None:
                try:
                    await producer.stop()
                except Exception:  # pragma: no cover - cleanup failure does not affect degradation
                    pass
            logger.warning(
                "OTLP KafkaSink failed to connect to %s; rejecting for now and reconnecting every %.0fs "
                "(clients get 503 and back off)",
                self._bootstrap,
                self._reconnect_interval,
                exc_info=True,
            )
            return
        self._producer = producer
        self._ready = True
        logger.info("OTLP KafkaSink connected to %s (topic=%s)", self._bootstrap, self._topic)

    async def _reconnect(self) -> None:
        await self._on_start()

    async def _write_batch(self, events: list[dict[str, Any]]) -> None:
        if self._producer is None:
            raise RuntimeError("kafka producer is not ready")
        for ev in events:
            key = str(ev.get("trace_id") or ev.get("id") or "")
            await self._producer.send(self._topic, key=key, value=ev)
        await self._producer.flush()

    async def _on_stop(self) -> None:
        producer, self._producer = self._producer, None
        if producer is None:
            return
        try:
            await producer.flush()
        except Exception:  # pragma: no cover - errors during shutdown are only logged
            logger.warning("OTLP KafkaSink flush failed", exc_info=True)
        try:
            await producer.stop()
        except Exception:  # pragma: no cover
            logger.warning("OTLP KafkaSink shutdown failed", exc_info=True)


class RedisSink(BaseSink):
    """XADD to a Redis Stream; the `data` field is byte-for-byte identical to `trace_sdk.RedisExporter`."""

    _mark_unready_on_failure = True

    def __init__(
        self,
        *,
        url: str,
        topic: str = "trace_topic",
        maxsize: int = 10000,
        batch_size: int = 200,
        flush_interval: float = 1.0,
        reconnect_interval: float = 5.0,
        connect_timeout: float = 10.0,
        client: Any = None,
    ) -> None:
        super().__init__(
            maxsize=maxsize,
            batch_size=batch_size,
            flush_interval=flush_interval,
            reconnect_interval=reconnect_interval,
        )
        self._url = url
        self._topic = topic
        self._connect_timeout = max(0.5, connect_timeout)
        self._client = client

    async def _connect(self) -> Any:
        if self._client is not None:
            return self._client
        import redis.asyncio as aioredis

        client = aioredis.from_url(self._url, decode_responses=False)
        await client.ping()
        return client

    async def _on_start(self) -> None:
        try:
            self._client = await asyncio.wait_for(
                self._connect(), timeout=self._connect_timeout
            )
        except Exception:
            self._client = None
            self._ready = False
            logger.warning(
                "OTLP RedisSink failed to connect; rejecting for now and reconnecting every %.0fs "
                "(clients get 503 and back off)",
                self._reconnect_interval,
                exc_info=True,
            )
            return
        self._ready = True
        logger.info("OTLP RedisSink connected (topic=%s)", self._topic)

    async def _reconnect(self) -> None:
        await self._on_start()

    async def _write_batch(self, events: list[dict[str, Any]]) -> None:
        if self._client is None:
            raise RuntimeError("redis client is not ready")
        pipe = self._client.pipeline()
        for ev in events:
            pipe.xadd(self._topic, {"data": json.dumps(ev, ensure_ascii=False)})
        await pipe.execute()

    async def _on_stop(self) -> None:
        client, self._client = self._client, None
        if client is None:
            return
        try:
            await client.aclose()
        except Exception:  # pragma: no cover
            logger.warning("OTLP RedisSink shutdown failed", exc_info=True)


def _batch_kwargs(kwargs: dict[str, Any]) -> dict[str, Any]:
    keys = ("maxsize", "batch_size", "flush_interval")
    return {k: kwargs[k] for k in keys if kwargs.get(k) is not None}


def _reconnect_kwargs(kwargs: dict[str, Any]) -> dict[str, Any]:
    keys = ("reconnect_interval", "connect_timeout")
    return {k: kwargs[k] for k in keys if kwargs.get(k) is not None}


def build_sink(sink_kind: str = "", **kwargs: Any) -> BaseSink:
    """Build the sink instance according to OTLP_SINK (connection parameters not passed explicitly come from config)."""
    kind = (sink_kind or "").strip().lower()
    batch = _batch_kwargs(kwargs)
    net = {**batch, **_reconnect_kwargs(kwargs)}

    if kind == "none":
        return NilSink(**batch)
    if kind == "file":
        root = kwargs.get("root")
        if root in (None, ""):
            from config import OTLP_FILE_DIR

            root = OTLP_FILE_DIR
        return FileSink(root, **batch)
    if kind == "kafka":
        from config import (
            OTLP_KAFKA_ACKS,
            OTLP_KAFKA_BOOTSTRAP,
            OTLP_KAFKA_TOPIC,
        )

        return KafkaSink(
            bootstrap=kwargs.get("bootstrap") or OTLP_KAFKA_BOOTSTRAP,
            topic=kwargs.get("topic") or OTLP_KAFKA_TOPIC,
            acks=kwargs.get("acks") or OTLP_KAFKA_ACKS,
            producer_factory=kwargs.get("producer_factory"),
            **net,
        )
    if kind == "redis":
        from config import OTLP_REDIS_TOPIC, OTLP_REDIS_URL

        return RedisSink(
            url=kwargs.get("url") or OTLP_REDIS_URL,
            topic=kwargs.get("topic") or OTLP_REDIS_TOPIC,
            client=kwargs.get("client"),
            **net,
        )
    raise RuntimeError(f"Unknown OTLP_SINK: {sink_kind!r}")
