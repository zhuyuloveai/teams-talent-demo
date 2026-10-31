<script setup lang="ts">
// Embedded Trace detail page: injects the fetch callbacks and offers a back-to-list link at the top
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAppConfigStore } from "@/stores/appConfig";
import { fetchTraceDetail, fetchTraceTree, fetchLlmRequests, fetchSpanDetail } from "@/api/traces";
import TraceDetail from "@/views/TraceDetail.vue";

const route = useRoute();
const router = useRouter();
const projectId = String(route.params.projectId || "");
const sessionId = route.params.sessionId ? String(route.params.sessionId) : null;
const traceId = String(route.params.traceId || "");

const appConfigStore = useAppConfigStore();
// false while config is unconfirmed (loaded is false), so lazy loading is not injected; when in doubt, do not lazy-load
const spanDetailFetcher = computed(() =>
  appConfigStore.lazyDetailEnabled() ? fetchSpanDetail : undefined,
);

function backToList() {
  if (window.parent !== window) window.parent.postMessage({ type: "teams-trace-route", projectId, sessionId, traceId: null }, window.location.origin);
  router.push({ path: "/", query: route.query });
}
</script>

<template>
  <div class="tm-detail-page">
    <button class="tm-back" type="button" @click="backToList">← Back to list</button>
    <TraceDetail
      :project-id="projectId"
      :trace-id="traceId"
      :session-id="sessionId"
      :fetch-detail="fetchTraceDetail"
      :fetch-tree="fetchTraceTree"
      :fetch-llm-requests="fetchLlmRequests"
      :fetch-span-detail="spanDetailFetcher"
      class="tm-detail-view"
    />
  </div>
</template>

<style scoped>
.tm-detail-page {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 520px;
  /* Matches the App.vue content area's vertical padding (16 + 24) */
  height: calc(100vh - 40px);
}
.tm-back {
  align-self: flex-start;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--accent-strong);
  font-size: 12.5px;
  padding: 5px 12px;
  cursor: pointer;
}
.tm-back:hover {
  background: var(--accent-soft);
}
.tm-detail-view {
  flex: 1;
  min-height: 0;
}
</style>
