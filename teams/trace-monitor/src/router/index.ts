// Route configuration (Vue Router 4)
// base comes from Vite's BASE_URL: when embedded in the demo it is mounted under /trace-monitor/
import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "traces",
      component: () => import("@/views/TraceList.vue"),
    },
    {
      path: "/traces/:projectId/:sessionId?/:traceId",
      name: "trace-detail",
      component: () => import("@/views/TraceDetailPage.vue"),
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/",
    },
  ],
});

export default router;
