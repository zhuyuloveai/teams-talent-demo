// Trace API wrappers: list / detail / call tree / node detail / real LLM request
// The detail / call tree / node detail / LLM request functions match TraceDetail's fetch callback signatures,
// so integrators can reuse them to build <TraceDetail>'s fetch callbacks (endpoint formats are maintained here)
import { api } from "@/utils/request";
import type {
  FetchLlmRequests,
  FetchSpanDetail,
  FetchTraceDetail,
  FetchTraceTree,
  LlmRequest,
  SpanDetailResp,
  TraceDetailResp,
  TraceListResp,
  TraceTreeResp,
} from "@/types";

export interface TraceQuery {
  page: number;
  pageSize: number;
  agentName?: string;
  status?: string;
  sessionId?: string;
  traceId?: string;
}

// List: GET /projects/{pid}/traces?page=&page_size=&agent_name=&status=&session_id=&trace_id=
export async function fetchTraces(
  projectId: string,
  params: TraceQuery,
): Promise<TraceListResp> {
  const { data } = await api.get<TraceListResp>(`/projects/${projectId}/traces`, {
    params: {
      page: params.page,
      page_size: params.pageSize,
      agent_name: params.agentName || undefined,
      status: params.status || undefined,
      session_id: params.sessionId || undefined,
      trace_id: params.traceId || undefined,
    },
  });
  return data;
}

// Detail: GET /projects/{projectId}/traces/{traceId}?session_id=
// projectId must be a concrete project id (row-level pid is passed through)
// sessionId is optional: the file backend uses it to look up <pid>/<sid>/<trace_id>.jsonl directly, which is faster
export const fetchTraceDetail: FetchTraceDetail = async (
  projectId,
  traceId,
  sessionId,
) => {
  const { data } = await api.get<TraceDetailResp>(
    `/projects/${projectId}/traces/${traceId}`,
    { params: { session_id: sessionId || undefined } },
  );
  return data;
};

// Call tree: GET /projects/{projectId}/traces/{traceId}/tree?session_id=
export const fetchTraceTree: FetchTraceTree = async (
  projectId,
  traceId,
  sessionId,
) => {
  const { data } = await api.get<TraceTreeResp>(
    `/projects/${projectId}/traces/${traceId}/tree`,
    { params: { session_id: sessionId || undefined } },
  );
  return data;
};

// Node detail: GET /projects/{projectId}/traces/{traceId}/spans/{spanId}?session_id=
// projectId must be a concrete project id (row-level pid is passed through)
// Note: the file-mode backend does not implement this endpoint; integrators must not inject it in file mode
export const fetchSpanDetail: FetchSpanDetail = async (
  projectId,
  traceId,
  spanId,
  sessionId,
) => {
  const { data } = await api.get<SpanDetailResp>(
    `/projects/${projectId}/traces/${traceId}/spans/${spanId}`,
    { params: { session_id: sessionId || undefined } },
  );
  return data;
};

// Real LLM request: GET /projects/{projectId}/llm_requests/{eventId}
// The backend always filters by project (projectId must be a concrete project id)
export const fetchLlmRequests: FetchLlmRequests = async (eventId, projectId) => {
  const { data } = await api.get<LlmRequest>(
    `/projects/${projectId}/llm_requests/${eventId}`,
  );
  return data ?? null;
};

// Restore and download: GET /projects/{projectId}/traces/{traceId}/export?session_id=
// Restores the trace as a file-mode <traceId>.jsonl and triggers a browser download
// Both modes are supported: database mode rebuilds the rows from tables, file mode returns the file on disk as is
// sessionId is optional: the file backend uses it to look up <pid>/<sid>/<trace_id>.jsonl directly, which is faster
export async function downloadTraceJsonl(
  projectId: string,
  traceId: string,
  sessionId?: string | null,
): Promise<void> {
  const { data } = await api.get<Blob>(
    `/projects/${projectId}/traces/${traceId}/export`,
    {
      params: { session_id: sessionId || undefined },
      responseType: "blob",
    },
  );
  const url = URL.createObjectURL(data);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${traceId}.jsonl`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
