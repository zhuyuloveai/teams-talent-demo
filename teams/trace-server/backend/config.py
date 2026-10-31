"""Central server configuration: read from trace_server/.env / environment variables, no hard-coded defaults.

All settings:
- STORAGE_BACKEND : database | file
- DATABASE_URL    : SQLAlchemy async URL (database backend)
- DATA_FILE       : Directory of JSONL files written directly by the SDK (file backend, read-only)
- HOST / PORT     : server listen address

The config file is trace_server/.env; this module lives under backend/.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# trace_server root = parent directory of backend
SERVER_ROOT = Path(__file__).resolve().parent.parent
# Load trace_server/.env (when present); environment variables win (load_dotenv does not override existing variables by default)
_ENV_FILE = SERVER_ROOT / ".env"
load_dotenv(_ENV_FILE, override=False)

DEFAULT_STORAGE_BACKEND = "database"
STORAGE_BACKENDS = ("database", "file")

# Storage backend
STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", DEFAULT_STORAGE_BACKEND)
if STORAGE_BACKEND not in STORAGE_BACKENDS:
    raise RuntimeError(
        f"Invalid STORAGE_BACKEND: {STORAGE_BACKEND!r}, allowed values: {STORAGE_BACKENDS}"
    )

# Database URL (required by the database backend)
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if STORAGE_BACKEND == "database" and not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set: configure the database connection in trace_server/.env, "
        "for example postgresql+asyncpg://postgres:postgres@127.0.0.1:5432/trace_db"
    )

# Directory of JSONL files written directly by the SDK (used by the file backend, read-only)
DATA_FILE = os.getenv("DATA_FILE", "trace_data")

# Server listen address
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))

# A relative DATA_FILE is resolved against the trace_server/ root
if not os.path.isabs(DATA_FILE):
    DATA_FILE = str(SERVER_ROOT / DATA_FILE)


# ============================================================
# OTLP endpoint ingestion (see the OTLP endpoint ingestion design doc)
#
# Note: OTLP_SINK and STORAGE_BACKEND are **two independent switches**:
#   OTLP_SINK       -- where the receiver writes events
#   STORAGE_BACKEND -- where the query side reads from
# They do not depend on each other, so combinations such as "write to Kafka, read Python files" are allowed.
# ============================================================

OTLP_ENABLED = os.getenv("OTLP_ENABLED", "1") == "1"

# Ingestion path (mounted at the root, not under the /api/v1 prefix)
OTLP_PATH = os.getenv("OTLP_PATH", "/v1/traces")

# Write sink: kafka (default) | redis | file | none
OTLP_SINK = os.getenv("OTLP_SINK", "kafka").strip().lower()
OTLP_SINK_CHOICES = ("kafka", "redis", "file", "none")

# Fallback project when the client sends no project attribute
OTLP_DEFAULT_PROJECT_ID = os.getenv("OTLP_DEFAULT_PROJECT_ID", "otlp")

# When non-empty, Authorization: Bearer <token> is checked
OTLP_AUTH_TOKEN = os.getenv("OTLP_AUTH_TOKEN", "").strip()

# Request body limit (bytes), default 16MB
OTLP_MAX_BODY_BYTES = int(os.getenv("OTLP_MAX_BODY_BYTES", str(16 * 1024 * 1024)))

# Batching parameters
OTLP_QUEUE_SIZE = int(os.getenv("OTLP_QUEUE_SIZE", "10000"))
OTLP_FLUSH_INTERVAL = float(os.getenv("OTLP_FLUSH_INTERVAL", "1.0"))
OTLP_BATCH_SIZE = int(os.getenv("OTLP_BATCH_SIZE", "200"))

# Event timestamp time zone (IANA name); must match TRACE_TIMEZONE on the SDK side
OTLP_TIMEZONE = os.getenv("OTLP_TIMEZONE", "Asia/Shanghai")

# Output directory of the file sink; empty means DATA_FILE is used
_OTLP_FILE_DIR_RAW = os.getenv("OTLP_FILE_DIR", "").strip()
OTLP_FILE_DIR = _OTLP_FILE_DIR_RAW or DATA_FILE
if _OTLP_FILE_DIR_RAW and not os.path.isabs(_OTLP_FILE_DIR_RAW):
    OTLP_FILE_DIR = str(SERVER_ROOT / _OTLP_FILE_DIR_RAW)

# kafka sink (used when OTLP_SINK=kafka): the receiver's own connection string,
# independent of the query-side and consumer-side settings
OTLP_KAFKA_BOOTSTRAP = os.getenv("OTLP_KAFKA_BOOTSTRAP", "127.0.0.1:9092").strip()
OTLP_KAFKA_TOPIC = os.getenv("OTLP_KAFKA_TOPIC", "trace_topic").strip()
OTLP_KAFKA_ACKS = os.getenv("OTLP_KAFKA_ACKS", "all").strip()

# redis sink (used when OTLP_SINK=redis)
OTLP_REDIS_URL = os.getenv(
    "OTLP_REDIS_URL", "redis://:myredissecret@127.0.0.1:6379/0"
).strip()
OTLP_REDIS_TOPIC = os.getenv("OTLP_REDIS_TOPIC", "trace_topic").strip()

# Reconnect interval when downstream is unreachable (seconds)
OTLP_RECONNECT_INTERVAL = float(os.getenv("OTLP_RECONNECT_INTERVAL", "5.0"))

if OTLP_ENABLED and OTLP_SINK not in OTLP_SINK_CHOICES:
    raise RuntimeError(
        f"Invalid OTLP_SINK: {OTLP_SINK!r}, allowed values: {OTLP_SINK_CHOICES}"
    )
