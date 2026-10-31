<script setup lang="ts">
// Trace list page: table + Agent/status/ID filters + configurable columns + pagination + row click opens detail
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import dayjs from "dayjs";
import { ElMessage } from "element-plus";
import { Refresh } from "@element-plus/icons-vue";
import { useProjectStore } from "@/stores/project";
import { useAppConfigStore } from "@/stores/appConfig";
import { fetchTraces, downloadTraceJsonl } from "@/api/traces";
import type { Trace } from "@/types";
import StatusBadge from "@/components/StatusBadge.vue";

const route = useRoute();
const router = useRouter();
const projectStore = useProjectStore();
const appConfigStore = useAppConfigStore();

// All selectable column definitions (key controls visibility, label is the column name, width is the column width)
const ALL_COLUMNS = [
  { key: "startedAt", label: "Time", width: 170 },
  { key: "projectId", label: "Project ID", width: 240 },
  { key: "sessionId", label: "Session ID", width: 240 },
  { key: "id", label: "Trace ID", width: 240 },
  { key: "agentName", label: "Agent", width: 140 },
  { key: "durationMs", label: "Duration (ms)", width: 110 },
  { key: "totalTokens", label: "Token", width: 100 },
  { key: "spanCount", label: "Spans", width: 90 },
  { key: "toolCount", label: "Tools", width: 90 },
  { key: "status", label: "Status", width: 100 },
] as const;
type ColumnKey = (typeof ALL_COLUMNS)[number]["key"];

const items = ref<Trace[]>([]);
const total = ref(0);
const loading = ref(false);
const loadError = ref(false);
const page = ref(1);
const pageSize = ref(20);
const agentName = ref<string | undefined>();
const status = ref<string | undefined>();
const idKeyword = ref<string | undefined>();
const keywordInput = ref<string>("");
// Agent select options: derived from the current list data (the backend no longer has a GET /agents API)
const agentOptions = computed<{ label: string; value: string }[]>(() => {
  const names = new Set<string>();
  for (const it of items.value) if (it.agentName) names.add(it.agentName);
  return [...names].map((a) => ({ label: a, value: a }));
});
const visibleKeys = ref<Set<ColumnKey>>(new Set(ALL_COLUMNS.map((c) => c.key)));

function notifyHost(projectId: string, sessionId: string | null, traceId: string | null) {
  if (window.parent === window) return;
  window.parent.postMessage({ type: "teams-trace-route", projectId, sessionId, traceId }, window.location.origin);
}

function applyHostScope() {
  const project = typeof route.query.project === "string" ? route.query.project : "";
  const session = typeof route.query.session === "string" ? route.query.session : "";
  if (project) projectStore.applySelection(project);
  if (session) { keywordInput.value = session; idKeyword.value = session; }
}

async function load(preserveOnError = false) {
  const pid = projectStore.projectId();
  if (!pid) return;
  loading.value = true;
  loadError.value = false;
  try {
    const resp = await fetchTraces(pid, {
      page: page.value,
      pageSize: pageSize.value,
      agentName: agentName.value,
      status: status.value,
      sessionId: idKeyword.value,
      traceId: idKeyword.value,
    });
    items.value = resp.items;
    total.value = resp.total;
  } catch {
    loadError.value = true;
    if (!preserveOnError) { items.value = []; total.value = 0; }
    ElMessage.error("Failed to load the trace list. Check that the API is available.");
  } finally {
    loading.value = false;
  }
}

// Watch filter changes: pagination changes re-query, other changes reset to page 1
watch(
  [() => projectStore.selected, () => projectStore.projects.length],
  () => {
    page.value = 1;
    load();
  },
);
watch([page, pageSize], () => load());
watch([agentName, status], () => {
  page.value = 1;
  load();
});

// Storage mode: in file mode list_traces only returns {id, projectId, sessionId}, so summary columns have no data
onMounted(() => {
  applyHostScope();
  appConfigStore.load();
  load();
});

// Reset the Agent filter when the project changes
watch(
  () => projectStore.projectId(),
  () => {
    agentName.value = undefined;
  },
);

function onSearch() {
  idKeyword.value = keywordInput.value.trim() || undefined;
  page.value = 1;
  load();
}

function onAgentChange(v?: string) {
  agentName.value = v || undefined;
  page.value = 1;
}

function onStatusChange(v?: string) {
  status.value = v || undefined;
  page.value = 1;
}

function toggleColumn(key: ColumnKey) {
  const next = new Set(visibleKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  if (next.size === 0) return; // Keep at least one column
  visibleKeys.value = next;
}

// Effective columns: file mode keeps only columns with data (Project ID / Session ID / Trace ID) and hides summary columns
// Until config returns, the store defaults to "database" (not file), matching the previous behavior
const isFileBackend = computed(() => appConfigStore.storageBackend === "file");
const effectiveColumns = computed(() =>
  isFileBackend.value
    ? ALL_COLUMNS.filter((c) => ["projectId", "sessionId", "id"].includes(c.key))
    : ALL_COLUMNS.filter((c) => visibleKeys.value.has(c.key)),
);

const columns = computed(() =>
  effectiveColumns.value.map((c) => ({
    key: c.key,
    label: c.label,
    // File mode has only 3 ID columns: no fixed width, so el-table fills the whole row
    width: isFileBackend.value ? undefined : c.width,
  })),
);

function fmtTime(v?: string) {
  return v ? dayjs(v).format("YYYY-MM-DD HH:mm:ss") : "—";
}

// Project switch / refresh: formerly in the iframe's top toolbar, now merged into the page toolbar to avoid a duplicate title bar
function onProjectChange(v: string) {
  projectStore.applySelection(v);
}
function reload() {
  load(true);
}

function rowClick(row: Trace) {
  const pid = row.projectId || projectStore.projectId();
  if (!pid) return;
  // Both detail and back keep the real project/session scope, so the host can restore the same trace.
  notifyHost(pid, row.sessionId || null, row.id);
  router.push({
    path: row.sessionId ? `/traces/${pid}/${row.sessionId}/${row.id}` : `/traces/${pid}/${row.id}`,
    query: { project: pid, ...(row.sessionId ? { session: row.sessionId } : {}) },
  });
}

// Download the jsonl restored from this row's trace: action column button; stop propagation so the row click does not open the detail
const downloadingId = ref<string | null>(null);

async function onDownload(row: Trace) {
  const pid = row.projectId || projectStore.projectId();
  if (!pid) return;
  downloadingId.value = row.id;
  try {
    await downloadTraceJsonl(pid, row.id, row.sessionId);
  } catch {
    ElMessage.error("Download failed. Check that this trace exists.");
  } finally {
    downloadingId.value = null;
  }
}
</script>

<template>
  <div class="tm-page">
    <div class="tm-page-head">
      <div>
        <h2 class="tm-page-title">Traces</h2>
        <p class="tm-page-sub">Agent run traces and key metrics. Click a row to see the full call chain.</p>
      </div>
      <div class="tm-toolbar" style="margin-bottom: 0">
        <el-select
          :model-value="projectStore.selected"
          filterable
          allow-create
          default-first-option
          placeholder="Project ID"
          class="tm-project-select"
          @change="onProjectChange"
        >
          <el-option
            v-for="p in projectStore.projects"
            :key="p.id"
            :label="p.id"
            :value="p.id"
          />
        </el-select>
        <el-input
          v-model="keywordInput"
          clearable
          placeholder="Filter by Trace ID / Session ID"
          style="width: 260px"
          @keyup.enter="onSearch"
          @clear="onSearch"
        >
          <template #append>
            <el-button @click="onSearch">Search</el-button>
          </template>
        </el-input>
        <template v-if="!isFileBackend">
          <el-select
            v-model="agentName"
            clearable
            placeholder="Agent"
            style="width: 160px"
            @change="onAgentChange"
          >
            <el-option v-for="o in agentOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
          <el-select
            v-model="status"
            clearable
            placeholder="Status"
            style="width: 110px"
            @change="onStatusChange"
          >
            <el-option label="Success" value="success" />
            <el-option label="Failed" value="error" />
          </el-select>
          <el-dropdown trigger="click">
            <el-button>Columns</el-button>
            <template #dropdown>
              <div class="tm-column-menu">
                <div class="tm-column-menu-title">Visible columns</div>
                <el-checkbox
                  v-for="c in ALL_COLUMNS"
                  :key="c.key"
                  :model-value="visibleKeys.has(c.key)"
                  @change="() => toggleColumn(c.key)"
                >
                  {{ c.label }}
                </el-checkbox>
              </div>
            </template>
          </el-dropdown>
        </template>
        <span class="tm-mode">
          <span class="tm-mode-dot" :class="{ file: isFileBackend }" />
          {{ isFileBackend ? "File mode" : "Database mode" }}
        </span>
        <el-button :icon="Refresh" @click="reload">Refresh</el-button>
      </div>
    </div>

    <div v-if="loadError" class="tm-load-error" role="alert"><span>{{ items.length ? "Refresh failed. Showing the last successful result." : "Failed to load trace data. Check the service and try again." }}</span><el-button size="small" @click="reload">Retry</el-button></div>

    <div class="tm-panel">
      <div class="tm-table-wrap">
      <el-table
        :data="items"
        v-loading="loading"
        row-key="id"
        style="width: 100%"
        @row-click="rowClick"
      >
        <el-table-column
          v-for="col in columns"
          :key="col.key"
          :prop="col.key"
          :label="col.label"
          :width="col.width"
        >
          <template #default="{ row }">
            <template v-if="col.key === 'startedAt'">
              {{ fmtTime(row.startedAt) }}
            </template>
            <template v-else-if="col.key === 'status'">
              <StatusBadge :status="row.status" />
            </template>
            <template v-else-if="col.key === 'agentName'">
              <span class="tm-agent">{{ row.agentName || "—" }}</span>
            </template>
            <template v-else-if="col.key === 'durationMs'">
              <span class="tm-num">{{ row.durationMs != null ? row.durationMs : "—" }}</span>
            </template>
            <template v-else-if="col.key === 'totalTokens'">
              <span class="tm-num">{{ row.totalTokens != null ? row.totalTokens : "—" }}</span>
            </template>
            <template v-else-if="col.key === 'spanCount'">
              {{ row.spanCount ?? "—" }}
            </template>
            <template v-else-if="col.key === 'toolCount'">
              <span class="tm-num">{{ row.toolCount != null ? row.toolCount : "—" }}</span>
            </template>
            <template v-else>
              <code v-if="row[col.key] != null" class="tm-code">{{ row[col.key] }}</code>
              <span v-else>—</span>
            </template>
          </template>
        </el-table-column>
        <!-- Download: the backend restores <trace_id>.jsonl by trace_id (database rebuilds rows / file returns the original) -->
        <el-table-column
          label="Actions"
          width="90"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :loading="downloadingId === row.id"
              @click.stop="onDownload(row)"
            >
              Download
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      </div>

      <div class="tm-pagination">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          background
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tm-page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.tm-page-title {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--ink-strong);
}
.tm-page-sub {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: var(--ink-weak);
}
.tm-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tm-project-select {
  width: 150px;
}
.tm-mode {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ink-mid);
  white-space: nowrap;
}
.tm-mode-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 0 3px var(--success-soft);
}
.tm-mode-dot.file {
  background: var(--danger);
  box-shadow: 0 0 0 3px var(--danger-soft);
}
.tm-load-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  padding: 8px 12px;
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--danger);
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  font-size: 12px;
}
.tm-panel {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: 0 1px 2px rgba(20, 24, 20, 0.03), 0 4px 16px rgba(20, 24, 20, 0.04);
  overflow: hidden;
}
.tm-table-wrap {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.tm-table-wrap :deep(.el-table) {
  width: 100%;
}
.tm-pagination {
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
}
.tm-column-menu {
  padding: 8px;
  min-width: 160px;
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tm-column-menu-title {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink-weak);
  margin-bottom: 2px;
}
.tm-agent {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
.tm-num {
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  white-space: nowrap;
}
.tm-code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-mid);
}
@media (max-width: 600px) {
  .tm-page-head {
    align-items: stretch;
  }
  .tm-toolbar {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .tm-project-select {
    width: 100%;
    grid-column: 1 / -1;
  }
  .tm-toolbar :deep(.el-input) {
    width: 100% !important;
    min-width: 0;
    grid-column: 1 / -1;
  }
  .tm-toolbar :deep(.el-select) {
    max-width: 100%;
  }
  .tm-table-wrap :deep(.el-table) {
    min-width: 560px;
  }
  .tm-pagination {
    justify-content: center;
    padding: 12px 8px;
  }
  .tm-pagination :deep(.el-pagination__total),
  .tm-pagination :deep(.el-pagination__sizes) {
    display: none;
  }
}
</style>
