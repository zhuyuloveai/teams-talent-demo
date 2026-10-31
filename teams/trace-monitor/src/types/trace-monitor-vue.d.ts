// ============================================================
// trace-monitor-vue type declarations (maintained by hand)
// Kept one to one with the src/lib.ts exports; components are typed with the DefineComponent generic
// Copied to dist/trace-monitor-vue.d.ts by the build:lib script at build time
// ============================================================
import type { App, DefineComponent, Component } from "vue";

/* ================= Types (match src/types/index.ts) ================= */

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
  name: string;
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

/* ================= Trace detail data-source callbacks ================= */

/** Detail: root Trace summary + all spans + observations
 *  projectId must be a concrete project id (row-level pid is passed through) */
export type FetchTraceDetail = (
  projectId: string,
  traceId: string,
) => Promise<TraceDetailResp>;

/** Call tree: tree structure (assembled from parent/child relations)
 *  projectId must be a concrete project id (row-level pid is passed through) */
export type FetchTraceTree = (
  projectId: string,
  traceId: string,
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

/* ================= Page components ================= */

export interface TraceDetailProps {
  /** Required: id of the trace to show; reloads automatically when it changes */
  traceId: string;
  /** Row-level project id (used for detail / call tree / LLM requests; must be a concrete project id) */
  projectId: string;
  /** Required: detail data-source callback (root Trace summary + spans + observations) */
  fetchDetail: FetchTraceDetail;
  /** Required: call tree data-source callback (tree assembled from parent/child relations) */
  fetchTree: FetchTraceTree;
  /** Required: real LLM request data-source callback (lazy-loaded when an llm node is clicked) */
  fetchLlmRequests: FetchLlmRequests;
  /** Optional: node detail data-source callback (lazy-loaded when a node is clicked); falls back to the local spans when omitted.
   *  The file-mode backend does not implement this API, so integrators must not inject it */
  fetchSpanDetail?: FetchSpanDetail;
  /** Optional: callback after data has loaded; integrators can use it to get the summary */
  onLoaded?: (detail: { trace: Trace }) => void;
}
export declare const TraceDetail: DefineComponent<TraceDetailProps>;

/* ================= Base components ================= */

export declare const TraceTree: DefineComponent<{
  tree: TraceNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}>;

export declare const TraceTreeNode: DefineComponent<{
  node: TraceNode;
  depth: number;
  selectedId?: string | null;
  defaultOpen?: boolean;
  hasSiblingBelow?: boolean;
}>;

export declare const DetailPanel: DefineComponent<{
  trace: Trace;
  /** Row-level project id (used for detail / call tree / LLM requests; must be a concrete project id) */
  projectId: string;
  /** Session id (optional): the file backend uses it to look up <pid>/<sid>/<trace_id>.jsonl directly, which is faster */
  sessionId?: string | null;
  traceId: string;
  selectedSpanId: string | null;
  spans: Span[];
  observations: Observation[];
  /** Required: real LLM request data-source callback (lazy-loaded when an llm node is clicked) */
  fetchLlmRequests: FetchLlmRequests;
  /** Optional: node detail data-source callback (lazy-loaded when a node is clicked); falls back to the local spans when omitted.
   *  The file-mode backend does not implement this API, so integrators must not inject it */
  fetchSpanDetail?: FetchSpanDetail;
}>;

export declare const JsonView: DefineComponent<{
  data?: unknown;
  depth?: number;
  name?: string;
}>;

export declare const MetaChips: DefineComponent<{
  span?: Span;
}>;

export declare const StatusBadge: DefineComponent<{
  status: string;
}>;

/* ================= API / utilities ================= */

/** Lets component library integrators set the backend API baseURL at runtime (e.g. "/api/v1" or a full URL) */
export declare function setTraceApiBase(url: string): void;

/** The API baseURL currently in effect */
export declare function getTraceApiBase(): string;

/** The axios instance used inside the component library */
export declare const api: import("axios").AxiosInstance;

/** Shared error message extraction */
export declare function extractError(e: unknown, fallback?: string): string;

/* ================= Data-source fetch functions (same signatures as the TraceDetail fetch callbacks) ================= */

/** Detail: GET /projects/{projectId}/traces/{traceId}?session_id= (row-level pid is passed through)
 *  sessionId is optional: the file backend uses it for a faster direct path lookup */
export declare function fetchTraceDetail(
  projectId: string,
  traceId: string,
  sessionId?: string | null,
): Promise<TraceDetailResp>;

/** Call tree: GET /projects/{projectId}/traces/{traceId}/tree?session_id=
 *  sessionId is optional: the file backend uses it for a faster direct path lookup */
export declare function fetchTraceTree(
  projectId: string,
  traceId: string,
  sessionId?: string | null,
): Promise<TraceTreeResp>;

/** Node detail: GET /projects/{projectId}/traces/{traceId}/spans/{spanId}?session_id=
 *  (row-level pid is passed through; the file-mode backend does not implement this API, so integrators must not inject it)
 *  sessionId is optional: the file backend uses it for a faster direct path lookup */
export declare function fetchSpanDetail(
  projectId: string,
  traceId: string,
  spanId: string,
  sessionId?: string | null,
): Promise<SpanDetailResp>;

/** Real LLM request: GET /projects/{projectId}/llm_requests/{eventId}
 *  (the backend always filters by project; projectId must be a concrete project id) */
export declare function fetchLlmRequests(
  eventId: string,
  projectId: string,
): Promise<LlmRequest | null>;

/** Restore and download: GET /projects/{projectId}/traces/{traceId}/export?session_id=
 *  Restores the trace as a file-mode <traceId>.jsonl and triggers a browser download (database rebuilds rows, file returns the original)
 *  sessionId is optional; the file backend uses it to look up <pid>/<sid>/<trace_id>.jsonl directly, which is faster */
export declare function downloadTraceJsonl(
  projectId: string,
  traceId: string,
  sessionId?: string | null,
): Promise<void>;

/* ================= Plugin object ================= */

export interface TraceMonitorOptions {
  /** Backend API baseURL; same as calling setTraceApiBase */
  baseURL?: string;
}

export interface TraceMonitorPlugin {
  install(app: App, options?: TraceMonitorOptions): void;
}

declare const TraceMonitor: TraceMonitorPlugin;

export default TraceMonitor;

/* ================= Registry of all components ================= */
export declare const components: Record<string, Component>;
