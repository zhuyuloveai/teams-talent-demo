<script setup lang="ts">
// Trace detail component: call tree on the left + detail panel on the right
// Driven by props.traceId with no router dependency; the integrator controls when data is fetched
// ★ The component has no built-in fetching: the detail / call tree / LLM request / node detail data sources are all injected by the integrator as
//   fetchDetail / fetchTree / fetchLlmRequests / fetchSpanDetail callbacks (the library's exported fetch functions can be reused)
import { computed, ref, watch } from "vue";
import dayjs from "dayjs";
import { ElMessage } from "element-plus";
import { Loading } from "@element-plus/icons-vue";
import type {
  FetchLlmRequests,
  FetchSpanDetail,
  FetchTraceDetail,
  FetchTraceTree,
  Observation,
  Span,
  Trace,
  TraceNode,
} from "@/types";
import TraceTree from "@/components/TraceTree.vue";
import DetailPanel from "@/components/DetailPanel.vue";

const props = withDefaults(
  defineProps<{
    /** Trace ID; reloads automatically when it changes */
    traceId: string;
    /** Row-level project id (used for detail / call tree / LLM requests; must be a concrete project id) */
    projectId: string;
    /** Optional: session id; the file backend uses it to look up <pid>/<sid>/<trace_id>.jsonl directly, which is faster */
    sessionId?: string | null;
    /** Required: detail data-source callback (root Trace summary + spans + observations) */
    fetchDetail: FetchTraceDetail;
    /** Required: call tree data-source callback (tree assembled from parent/child relations) */
    fetchTree: FetchTraceTree;
    /** Required: real LLM request data-source callback (lazy-loaded when an llm node is clicked) */
    fetchLlmRequests: FetchLlmRequests;
    /** Optional: node detail data-source callback (lazy-loaded when a node is clicked); falls back to the local spans when omitted.
     *  The file-mode backend does not implement this API, so integrators must not inject it (see the storage-mode gating) */
    fetchSpanDetail?: FetchSpanDetail;
    /** Callback after data has loaded; integrators can use it to get the summary */
    onLoaded?: (detail: { trace: Trace }) => void;
  }>(),
  {},
);

const treeData = ref<{ trace: Trace; tree: TraceNode[] } | null>(null);
const detail = ref<{ trace: Trace; spans: Span[]; observations: Observation[] } | null>(null);
const selectedId = ref<string | null>(null);
const loading = ref(false);

async function load() {
  if (!props.traceId || !props.projectId) return;
  loading.value = true;
  selectedId.value = null;
  try {
    const [t, d] = await Promise.all([
      props.fetchTree(props.projectId, props.traceId, props.sessionId),
      props.fetchDetail(props.projectId, props.traceId, props.sessionId),
    ]);
    treeData.value = t;
    detail.value = d;
    props.onLoaded?.({ trace: t.trace });
  } catch {
    ElMessage.error("Failed to load the detail. Check that the API is available.");
  } finally {
    loading.value = false;
  }
}

watch(
  [() => props.traceId, () => props.projectId, () => props.sessionId],
  ([id, pid]) => {
    if (id && pid) load();
  },
  { immediate: true },
);

const trace = computed(() => detail.value?.trace ?? treeData.value?.trace);

function fmtTime(v?: string) {
  return v ? dayjs(v).format("YYYY-MM-DD HH:mm:ss") : "—";
}
</script>

<template>
  <div v-if="loading" class="tm-scope tm-loading">
    <el-icon class="is-loading tm-spinner" :size="28"><Loading /></el-icon>
  </div>
  <div v-else-if="treeData && detail" class="tm-scope tm-page">
    <div class="tm-detail-layout">
      <div class="tm-panel tm-left-panel">
        <div class="tm-summary">
        <el-descriptions :column="2" size="small" class="tm-desc">
          <el-descriptions-item label="Trace ID">
            <code class="tm-code" :title="trace?.id">{{ trace?.id }}</code>
          </el-descriptions-item>
          <el-descriptions-item label="Agent">
            {{ trace?.agentName || "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="Status">
            <span :class="`tm-status ${trace?.status === 'success' ? 'success' : 'error'}`">
              {{ trace?.status === "success" ? "Success" : "Failed" }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="Duration">
            {{ trace?.durationMs != null ? `${trace?.durationMs}ms` : "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="Token">
            {{ trace?.totalTokens ?? "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="ReAct steps">
            {{ trace?.reactStepCount ?? "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="Tools">
            {{ trace?.toolCount ?? "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="Spans">
            {{ trace?.spanCount ?? "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="Time" :span="2">
            {{ fmtTime(trace?.startedAt) }}
          </el-descriptions-item>
        </el-descriptions>
      </div>
      <div class="tm-tree-area">
        <TraceTree :tree="treeData.tree" :selected-id="selectedId" :on-select="(id: string) => (selectedId = id)" />
      </div>
    </div>
    <div class="tm-panel tm-right-panel">
      <DetailPanel
        :trace="detail.trace"
        :project-id="props.projectId"
        :trace-id="props.traceId"
        :selected-span-id="selectedId"
        :spans="detail.spans"
        :observations="detail.observations"
        :session-id="props.sessionId"
        :fetch-span-detail="props.fetchSpanDetail"
        :fetch-llm-requests="props.fetchLlmRequests"
      />
    </div>
  </div>
  </div>
</template>

<style scoped lang="scss">
.tm-loading {
  min-height: 60vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 80px;
}
.tm-spinner {
  --el-color-primary: var(--accent);
}
.tm-page {
  height: 100%;
  min-height: 440px;
}
.tm-detail-layout {
  display: flex;
  gap: 6px;
  height: 100%;
  min-height: 440px;
}
.tm-left-panel {
  flex: 0 0 42%;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tm-summary {
  flex: none;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--border-subtle);
}
.tm-tree-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.tm-right-panel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.tm-panel {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: 0 1px 2px rgba(20, 24, 20, 0.03), 0 4px 16px rgba(20, 24, 20, 0.04);
}
@media (max-width: 900px) {
  .tm-detail-layout {
    flex-direction: row;
    height: 100%;
  }
  .tm-left-panel {
    flex: 0 0 40%;
    min-width: 240px;
  }
  .tm-right-panel {
    min-width: 0;
    overflow: hidden;
  }
}
.tm-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  padding: 1px 10px;
  height: 22px;
  border-radius: 999px;
  line-height: 1;
}
.tm-status::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
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
