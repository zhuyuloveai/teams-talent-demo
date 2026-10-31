// ============================================================
// Single entry point of the Trace Monitor component library (lib build)
// Lets third-party apps integrate it as components. Only the "Trace detail view" is componentized:
//   <TraceDetail :trace-id="'xxx'" />
// List, menu, shell and other business pages are implemented by the integrator.
// ============================================================
import type { App } from "vue";
import ElementPlus from "element-plus";
import en from "element-plus/es/locale/lang/en";
// Styles:
//   · Only component-level styles are imported here (all scoped under .tm-scope; the host's globals stay untouched)
//   · The host imports the Element Plus base styles itself (import "element-plus/dist/index.css");
//     this library no longer injects them globally, so the host's EP theme is not overridden
import "./styles/index.scss";

import { extractError, getTraceApiBase, setTraceApiBase, api } from "@/utils/request";
import { fetchTraceDetail, fetchTraceTree, fetchLlmRequests, fetchSpanDetail, downloadTraceJsonl } from "@/api/traces";

// Core export: the Trace detail component (no router dependency; driven by projectId + traceId)
// ★ TraceDetail does not fetch data itself: the integrator injects data-source callbacks through the
//   fetchDetail / fetchTree / fetchLlmRequests props and can reuse the fetch functions exported below;
//   optionally inject fetchSpanDetail to lazy-load node details (the file-mode backend does not implement it; do not inject it there)
import TraceDetail from "@/views/TraceDetail.vue";

// Base components: integrators can combine them as needed
import TraceTree from "@/components/TraceTree.vue";
import TraceTreeNode from "@/components/TraceTreeNode.vue";
import DetailPanel from "@/components/DetailPanel.vue";
import JsonView from "@/components/JsonView.vue";
import MetaChips from "@/components/MetaChips.vue";
import StatusBadge from "@/components/StatusBadge.vue";

// Named exports: detail component + base components + data-source fetch functions + API utilities
export {
  TraceDetail,
  TraceTree,
  TraceTreeNode,
  DetailPanel,
  JsonView,
  MetaChips,
  StatusBadge,
  // Data-source fetch functions: same signatures as TraceDetail's fetch callbacks, reusable to build them
  fetchTraceDetail,
  fetchTraceTree,
  fetchLlmRequests,
  fetchSpanDetail,
  downloadTraceJsonl,
  setTraceApiBase,
  getTraceApiBase,
  extractError,
  api,
};

// Registry of all components (for registering by name with app.component)
export const components = {
  TraceDetail,
  TraceTree,
  TraceTreeNode,
  DetailPanel,
  JsonView,
  MetaChips,
  StatusBadge,
};

export type * from "@/types/index";

// Plugin object: use the whole package, or import named components as needed
const TraceMonitor = {
  install(app: App, options?: { baseURL?: string }) {
    if (options?.baseURL) setTraceApiBase(options.baseURL);
    // Register Element Plus globally (en locale); page components are imported on demand
    app.use(ElementPlus, { locale: en });
  },
};

export default TraceMonitor;
