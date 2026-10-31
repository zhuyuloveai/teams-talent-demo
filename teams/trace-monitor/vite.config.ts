import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
// This copy is built as an embedded page of the Teams demo: output goes to teams/dist/trace-monitor,
// is served by the Teams server under /trace-monitor/, and the API goes through the Teams server proxy /trace-api.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "VITE_");

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    base: "/trace-monitor/",
    build: {
      outDir: "../dist/trace-monitor",
      emptyOutDir: true,
      sourcemap: false,
    },
    server: {
      port: Number(env.VITE_DEV_PORT || 5174),
      proxy: {
        "/trace-api": {
          target: env.VITE_API_TARGET || "http://127.0.0.1:8013",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/trace-api/, "/api/v1"),
        },
      },
    },
  };
});
