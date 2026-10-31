"""OTLP endpoint ingestion: converts standard OTLP/HTTP reports into trace2 internal events.

Modules:
- `decode`  -- request body decoding (protobuf / JSON) and ID normalization
- `semconv` -- OTel semantic convention constants + span_type inference
- `mapper`  -- resourceSpans -> internal event dict
- `sinks`   -- event sinks (kafka / redis / file / none)

Design doc: the OTLP endpoint ingestion design (not included in this repo)
"""
from __future__ import annotations

from .decode import (
    OtlpDecodeError,
    build_json_response,
    build_protobuf_response,
    decode_body,
    parse_otel_id,
)
from .mapper import flatten_attributes, hex_to_uuid, map_resource_spans
from .sinks import (
    BaseSink,
    FileSink,
    KafkaSink,
    NilSink,
    RedisSink,
    build_sink,
)

__all__ = [
    "OtlpDecodeError",
    "build_json_response",
    "build_protobuf_response",
    "decode_body",
    "parse_otel_id",
    "flatten_attributes",
    "hex_to_uuid",
    "map_resource_spans",
    "BaseSink",
    "FileSink",
    "KafkaSink",
    "RedisSink",
    "NilSink",
    "build_sink",
]
