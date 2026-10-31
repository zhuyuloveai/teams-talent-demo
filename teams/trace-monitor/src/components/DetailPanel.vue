<script setup lang="ts">
// Right-hand detail panel: Input/Output + metadata chips + Formatted JSON + Real LLM Request + error details
// The real LLM request data source is injected as the fetchLlmRequests callback; the component has no built-in fetching
// Node detail (input/output/errorInfo/observations) is optionally injected as the fetchSpanDetail callback:
//   when injected, clicking a node lazy-loads it (detail first, local spans as fallback); otherwise local in-memory lookup is used
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import type {
  FetchLlmRequests,
  FetchSpanDetail,
  LlmRequest,
  Observation,
  Span,
  SpanDetailResp,
  Trace,
} from "@/types";
import JsonView from "@/components/JsonView.vue";
import MetaChips from "@/components/MetaChips.vue";

const props = defineProps<{
  trace: Trace;
  /** Row-level project id (used for detail / call tree / LLM requests; must be a concrete project id) */
  projectId: string;
  /** Session id (optional): the file backend uses it to look up <pid>/<sid>/<trace_id>.jsonl directly, which is faster */
  sessionId?: string | null;
  traceId: string;
  // selectedSpanId === null means the root Trace is selected
  selectedSpanId: string | null;
  spans: Span[];
  observations: Observation[];
  /** Required: real LLM request data-source callback (lazy-loaded when an llm node is clicked) */
  fetchLlmRequests: FetchLlmRequests;
  /** Optional: node detail data-source callback; falls back to looking up spans when omitted (backward compatible)
   *  Note: the file-mode backend does not implement this API, so integrators must not inject it */
  fetchSpanDetail?: FetchSpanDetail;
}>();

const tab = ref("io");
const llmRequests = ref<LlmRequest[]>([]);
const llmLoading = ref(false);

// ===== Node detail lazy loading: detail first, local fallback =====
const spanDetail = ref<SpanDetailResp | null>(null);
const spanLoading = ref(false);
const spanError = ref(false);
const detailCache = new Map<string, SpanDetailResp>(); // key = spanId, no TTL, cleared when trace/project changes
let detailSeq = 0; // Race sequence number: drops late responses when nodes are clicked in quick succession

// Local span (from props.spans, i.e. the spans array of /detail)
const localSpan = computed<Span | undefined>(() =>
  props.selectedSpanId ? props.spans.find((s) => s.id === props.selectedSpanId) : undefined,
);
// Span used for display: prefers the lazy-loaded detail and renders the local one until it arrives
const span = computed<Span | undefined>(() => spanDetail.value?.span ?? localSpan.value);
// observations: prefer the lazy-loaded result; when the callback is injected, the local copy is not shown while loading or on failure
const spanObs = computed(() => {
  if (spanDetail.value) return spanDetail.value.observations;
  if (props.fetchSpanDetail) return [];
  return props.selectedSpanId
    ? props.observations.filter((o) => o.spanId === props.selectedSpanId)
    : [];
});

async function loadSpanDetail(sid: string | null, force = false) {
  // Take a sequence number first: any early return (root node / no callback) invalidates in-flight responses so they do not get mixed up
  const seq = ++detailSeq;
  spanDetail.value = null;
  spanError.value = false;
  spanLoading.value = false;

  const fetcher = props.fetchSpanDetail;
  const pid = props.projectId || props.trace.projectId || "";
  // Root Trace (empty sid) or no callback: no lazy loading, fall back to local spans / trace
  if (!fetcher || !sid || !pid || !props.traceId) return;

  if (force) detailCache.delete(sid);
  const hit = detailCache.get(sid);
  if (hit) {
    spanDetail.value = hit; // Cache hit: no request, no flicker
    return;
  }

  spanLoading.value = true;
  try {
    const resp = await fetcher(pid, props.traceId, sid, props.sessionId);
    if (seq !== detailSeq) return; // Selection changed; discard
    detailCache.set(sid, resp);
    spanDetail.value = resp;
  } catch {
    if (seq !== detailSeq) return;
    spanError.value = true; // A single node failure does not affect the whole page
  } finally {
    if (seq === detailSeq) spanLoading.value = false;
  }
}

function retrySpanDetail() {
  loadSpanDetail(props.selectedSpanId, true);
}

// Cache invalidation: cleared when trace / project / session changes (registered before the lazy-load watch so the previous trace's cache is never used)
watch(
  [() => props.traceId, () => props.projectId, () => props.sessionId],
  () => detailCache.clear(),
);

// When the selected node changes, fetch its detail by projectId + traceId + spanId
watch(
  [() => props.selectedSpanId, () => props.projectId, () => props.traceId, () => props.sessionId],
  ([sid]) => {
    loadSpanDetail(sid as string | null);
  },
  { immediate: true },
);

const isRoot = computed(() => !span.value);
const isLlm = computed(() => !isRoot.value && span.value!.spanType === "llm");
const title = computed(() =>
  isRoot.value
    ? props.trace.name || props.trace.agentName || "Trace"
    : span.value!.name,
);
const input = computed(() => (isRoot.value ? props.trace.input : span.value!.input));
const output = computed(() => (isRoot.value ? props.trace.output : span.value!.output));
const errorInfo = computed(() =>
  isRoot.value ? props.trace.errorInfo : span.value!.errorInfo,
);

// When switching nodes, if the current tab does not exist on the new node (e.g. "Real LLM Request" on a non-llm node),
// reset to "io" so a vanished tab does not stay selected
watch([tab, isLlm, () => props.selectedSpanId], ([t, llm]) => {
  if (t === "llm" && !llm) tab.value = "io";
});

// When an llm node is selected, fetch the real LLM request by projectId + eventId (1:1 relation)
// The backend always filters by project: projectId is the row-level pid passed to the component (with the detail root trace's
// projectId as fallback) and must be a concrete project id
// Depend on eventId rather than the span object reference: in one click the span is first the local brief (props.spans),
// then the lazy-loaded detail (detailCache/API response); the references differ but the eventId is the same;
// depending on span directly would send the same request twice for one node
watch(
  [
    () => props.selectedSpanId,
    isLlm,
    () => span.value?.eventId,
    () => props.projectId,
    () => props.trace.projectId,
  ],
  async ([, llm, ev]) => {
    const pid = props.projectId || props.trace.projectId || "";
    if (!llm || !ev || !pid) {
      llmRequests.value = [];
      return;
    }
    llmLoading.value = true;
    try {
      const item = await props.fetchLlmRequests(ev, pid);
      llmRequests.value = item ? [item] : [];
    } catch {
      llmRequests.value = [];
    } finally {
      llmLoading.value = false;
    }
  },
  { immediate: true },
);

function copyJson() {
  const payload = JSON.stringify(
    normalize({ input: input.value, output: output.value, error: errorInfo.value }),
    null,
    2,
  );
  navigator.clipboard?.writeText(payload);
  ElMessage.success("JSON copied");
}

// The backend may double-encode input/output as JSON strings (e.g. a tool's HTTP response body);
// stringifying directly escapes all quotes and newlines as \" and \n, which is unreadable;
// so strings that are themselves JSON are parsed back into structures recursively before formatting
// Parse depth limit: handles nested encoding while guarding against maliciously deep nested strings
const MAX_PARSE_DEPTH = 8;

function normalize(v: unknown, depth = 0): unknown {
  if (typeof v === "string") {
    if (depth >= MAX_PARSE_DEPTH) return v;
    const s = v.trim();
    // Only try objects/arrays so "123" or plain text is not parsed into another type
    if (!s.startsWith("{") && !s.startsWith("[")) return v;
    try {
      return normalize(JSON.parse(s), depth + 1);
    } catch {
      return v;
    }
  }
  if (Array.isArray(v)) return v.map((x) => normalize(x, depth + 1));
  if (v !== null && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, normalize(x, depth + 1)]),
    );
  }
  return v;
}

function fmt(v: unknown): string {
  return JSON.stringify(normalize(v) ?? null, null, 2);
}
</script>

<template>
  <div class="tm-scope tm-detail">
    <div class="tm-detail-head">
      <div class="tm-detail-title">{{ title }}</div>
    </div>

    <div class="tm-detail-body">
      <MetaChips v-if="!isRoot" :span="span" />

      <el-alert
        v-if="errorInfo"
        type="error"
        :closable="false"
        show-icon
        :title="errorInfo.message || errorInfo.errorType || 'Error'"
        class="tm-error-alert"
      >
        <div>
          <div v-if="errorInfo.errorType">Type: {{ errorInfo.errorType }}</div>
          <div v-if="errorInfo.errorCode">Code: {{ errorInfo.errorCode }}</div>
          <div v-if="errorInfo.errorCategory">Category: {{ errorInfo.errorCategory }}</div>
          <pre v-if="errorInfo.stackTrace" class="tm-json-block tm-stack">{{ errorInfo.stackTrace }}</pre>
        </div>
      </el-alert>

      <div v-if="spanObs.length > 0" class="tm-obs">
        <div class="tm-section-label">Token breakdown (observation)</div>
        <div class="tm-obs-list">
          <div v-for="o in spanObs" :key="o.id" class="tm-meta-chip">
            <span class="tm-obs-model">{{ o.model }}</span>
            <span>·</span>
            <span>prompt {{ o.promptTokens ?? 0 }}</span>
            <span>/</span>
            <span>completion {{ o.completionTokens ?? 0 }}</span>
          </div>
        </div>
      </div>

      <el-tabs v-model="tab" size="small" class="tm-tabs">
        <template #extra>
          <el-button size="small" @click="copyJson">Copy</el-button>
        </template>
        <el-tab-pane label="Input / Output" name="io">
          <div v-loading="spanLoading">
            <div v-if="spanError" class="tm-empty">
              <div>Failed to load node detail</div>
              <el-button size="small" type="primary" link @click="retrySpanDetail">Retry</el-button>
            </div>
            <div v-else-if="input !== undefined || output !== undefined || errorInfo !== undefined">
              <div class="tm-section-label">Input</div>
              <div class="tm-json-block"><JsonView :data="input" /></div>
              <div class="tm-section-label">Output</div>
              <div class="tm-json-block"><JsonView :data="output" /></div>
              <div class="tm-section-label">Error</div>
              <div class="tm-json-block"><JsonView :data="errorInfo" /></div>
            </div>
            <div v-else class="tm-empty">
              <div>No data</div>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="Formatted JSON" name="json">
          <div v-loading="spanLoading">
            <pre v-if="!spanError" class="tm-json-block">{{ fmt({ input, output, error: errorInfo }) }}</pre>
            <div v-else class="tm-empty">
              <div>Failed to load node detail</div>
              <el-button size="small" type="primary" link @click="retrySpanDetail">Retry</el-button>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane v-if="isLlm && llmRequests.length > 0" label="Real LLM Request" name="llm">
          <div v-loading="llmLoading">
            <div v-for="r in llmRequests" :key="r.eventId" class="tm-llm-item">
              <div v-if="r.model" class="tm-meta-chip">
                <span class="tm-obs-model">{{ r.model }}</span>
                <span>·</span>
                <span :class="r.status === 'error' ? 'tm-status error' : 'tm-status success'">
                  {{ r.status === "error" ? "Failed" : "Success" }}
                </span>
              </div>
              <div class="tm-section-label">Input</div>
              <pre class="tm-json-block">{{ fmt(r.input) }}</pre>
              <div class="tm-section-label">Output</div>
              <pre class="tm-json-block">{{ fmt(r.output) }}</pre>
              <template v-if="r.errorInfo">
                <div class="tm-section-label">Error</div>
                <pre class="tm-json-block">{{ fmt(r.errorInfo) }}</pre>
              </template>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tm-detail {
  height: 100%;
  overflow: auto;
  padding: 0;
}
.tm-detail-head {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--bg-elevated);
  padding: 10px 18px 12px;
  border-bottom: 1px solid var(--border-subtle);
}
.tm-detail-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--ink-strong);
  word-break: break-all;
  line-height: 1.4;
}
.tm-detail-body {
  padding: 14px 18px 24px;
}
.tm-error-alert {
  margin-bottom: 12px;
  border-radius: var(--radius-md);
}
.tm-stack {
  background: var(--danger-soft);
  margin-top: 8px;
  white-space: pre-wrap;
}
.tm-obs {
  margin-bottom: 14px;
}
.tm-obs-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tm-obs-model {
  color: var(--ink-strong);
  font-weight: 600;
}
.tm-llm-item {
  margin-bottom: 16px;
}
.tm-meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  background: var(--bg-subtle);
  color: var(--ink-mid);
  border: 1px solid var(--border-subtle);
  align-self: flex-start;
  margin-bottom: 8px;
}
.tm-section-label {
  font-size: 11.5px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-weak);
  margin: 14px 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.tm-section-label::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--border-subtle);
}
.tm-json-block {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--ink);
}
.tm-empty {
  padding: 48px 0;
  text-align: center;
  color: var(--ink-weak);
  font-size: 12.5px;
}
.tm-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 600;
  padding: 1px 8px;
  height: 20px;
  border-radius: 999px;
  line-height: 1;
}
.tm-status.success {
  color: var(--success);
  background: var(--success-soft);
}
.tm-status.error {
  color: var(--danger);
  background: var(--danger-soft);
}
</style>
