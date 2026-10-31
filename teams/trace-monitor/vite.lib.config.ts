// Component library build config: bundles src/lib.ts in lib mode (JS/CSS only)
// Type declarations are hand-written and produced by scripts/build-types.mjs (see dist/trace-monitor-vue.d.ts),
// to avoid vite-plugin-dts / api-extractor parsing bugs across TS versions.
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    lib: {
      entry: resolve(__dirname, "src/lib.ts"),
      name: "TraceMonitorVue",
      fileName: "trace-monitor-vue",
    },
    rollupOptions: {
      // Externalize Vue, Element Plus, vue-router, etc. to avoid bundling them twice; the host app provides them
      external: ["vue", "vue-router", "element-plus", "pinia", "axios", "dayjs"],
      output: {
        exports: "named",
        globals: {
          vue: "Vue",
          "element-plus": "ElementPlus",
        },
      },
    },
  },
});
