import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
// 该副本作为 Teams 演示的内嵌页构建：产物输出到 teams/dist/trace-monitor，
// 由 Teams 服务端按 /trace-monitor/ 提供，API 走 Teams 服务端代理 /trace-api。
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
