// Mirrors the backend P4 API response structures one to one (camelCase)

// Aligned with langfuse's 6 span_type values: the backend may return chain/llm/tool/agent/retriever/span
export type SpanType = "chain" | "llm" | "tool" | "agent" | "retriever" | "span";

export interface ErrorInfo {
  errorType?: string;
  errorCode?: string;
  errorCategory?: string;
  message?: string;
  stackTrace?: string;
}

export interface Span {
  id: string;
  eventId?: string;
  traceId: string;
  parentSpanId: string | null;
  name: string; // Node name, passed through unchanged
  spanType: SpanType;
  input?: unknown;
  output?: unknown;
  durationMs?: number;
  model?: string;
  toolName?: string;
  status: "success" | "error";
  errorInfo?: ErrorInfo;
  startedAt?: string;
}

export interface Trace {
  id: string;
  projectId: string | null;
  sessionId: string | null;
  name: string | null;
  agentName: string | null;
  input?: unknown;
  output?: unknown;
  durationMs?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  reactStepCount?: number;
  toolCount?: number;
  spanCount?: number;
  status: "success" | "error";
  errorInfo?: ErrorInfo;
  startedAt?: string;
}

export interface Observation {
  id: string;
  spanId: string | null;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  input?: unknown;
  output?: unknown;
}

export interface TraceNode {
  span?: Span;
  children: TraceNode[];
}

export interface TraceListResp {
  items: Trace[];
  total: number;
  page: number;
  page_size: number;
}

export interface TraceDetailResp {
  trace: Trace;
  spans: Span[];
  observations: Observation[];
}

export interface TraceTreeResp {
  trace: Trace;
  tree: TraceNode[];
}

/** Detail of a single node: all fields of the Span + its observations */
export interface SpanDetailResp {
  span: Span;
  observations: Observation[];
}

export interface LlmRequest {
  eventId: string;
  spanId?: string | null;
  model?: string;
  input?: unknown;
  output?: unknown;
  status?: string;
  errorInfo?: ErrorInfo;
  startedAt?: string;
}

export interface AppConfig {
  storageBackend: string;
}

// ============================================================
// Trace detail data-fetch callbacks (the component has no built-in fetching; integrators inject them as needed)
// ============================================================

/** Detail: root Trace summary + all spans + observations
 *  projectId must be a concrete project id (row-level pid is passed through)
 *  sessionId is optional: the file backend uses it to look up <pid>/<sid>/<trace_id>.jsonl directly, which is faster */
export type FetchTraceDetail = (
  projectId: string,
  traceId: string,
  sessionId?: string | null,
) => Promise<TraceDetailResp>;

/** Call tree: tree structure (assembled from parent/child relations)
 *  projectId must be a concrete project id (row-level pid is passed through)
 *  sessionId is optional: the file backend uses it for a faster direct path lookup */
export type FetchTraceTree = (
  projectId: string,
  traceId: string,
  sessionId?: string | null,
) => Promise<TraceTreeResp>;

/** Real LLM request: fetched one at a time by projectId + eventId when an llm node is clicked
 *  (the backend always filters by project; projectId must be a concrete project id) */
export type FetchLlmRequests = (
  eventId: string,
  projectId: string,
) => Promise<LlmRequest | null>;

/** Node detail: fetched by projectId + traceId + spanId when a node is clicked
 *  (projectId must be a concrete project id; the file-mode backend does not implement this API, so integrators must not inject it)
 *  sessionId is optional: passed through the same way as fetchTraceDetail / fetchTraceTree */
export type FetchSpanDetail = (
  projectId: string,
  traceId: string,
  spanId: string,
  sessionId?: string | null,
) => Promise<SpanDetailResp>;
