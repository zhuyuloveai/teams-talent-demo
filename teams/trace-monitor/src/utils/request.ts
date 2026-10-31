// Shared HTTP wrapper based on an axios instance; business code must not call new Axios directly (per company coding standards)
// baseURL can be configured in two ways:
//   1. The VITE_API_BASE environment variable (when built inside the app)
//   2. setTraceApiBase() (runtime override when integrated as a component library)
import axios from "axios";

let apiBase: string = import.meta.env.VITE_API_BASE || "/api/v1";

/** Lets component library integrators set the backend address at runtime */
export function setTraceApiBase(url: string) {
  apiBase = url;
}

/** The API base currently in effect */
export function getTraceApiBase(): string {
  return apiBase;
}

export const api = axios.create({
  timeout: 60000,
});

// Inject baseURL on every request so setTraceApiBase still works after the instance is created
api.interceptors.request.use((config) => {
  config.baseURL = apiBase;
  // Disable browser caching for all API requests, so a stale SPA fallback page (HTML) never breaks parsing
  config.headers["Cache-Control"] = "no-cache, no-store";
  return config;
});

// Shared error message extraction: axios error / backend detail / fallback
export function extractError(e: unknown, fallback = "Request failed"): string {
  if (axios.isAxiosError(e)) {
    const detail = (e.response?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === "string") return detail;
    if (e.message) return e.message;
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}
