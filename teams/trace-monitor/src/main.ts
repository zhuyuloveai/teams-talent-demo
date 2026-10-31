import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import en from "element-plus/es/locale/lang/en";
import "element-plus/dist/index.css";
import App from "./App.vue";
import router from "./router";
import { setTraceApiBase } from "@/utils/request";
// Global styles for the embedded page (:root tokens + global reset + Element Plus overrides for the list page)
import "./styles/dev-shell.scss";
// Component-level styles (same file as the component library build)
import "./styles/index.scss";

// The demo server proxies the backend: /trace-api -> trace-server /api/v1
setTraceApiBase(import.meta.env.VITE_API_BASE || "/trace-api");

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(ElementPlus, { locale: en });
app.mount("#app");
