// Global app config singleton: storageBackend is shown in the top bar and gates node detail lazy loading
// The whole app fetches /config only once (concurrent calls deduplicated), so App.vue and TraceList.vue do not each request it
import { defineStore } from "pinia";
import { ref } from "vue";
import { fetchConfig } from "@/api/metrics";

export const useAppConfigStore = defineStore("appConfig", () => {
  // Shown in the top bar; the "database" default keeps the existing AppTopbar behavior
  const storageBackend = ref("database");
  // Whether the config was loaded successfully: gating must rely on this (the database default cannot be used to decide)
  const loaded = ref(false);
  let inflight: Promise<void> | null = null; // Concurrent dedup: simultaneous load() calls send only 1 request

  function load() {
    if (loaded.value) return Promise.resolve();
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const cfg = await fetchConfig();
        storageBackend.value = cfg.storageBackend;
        loaded.value = true;
      } catch {
        /* On failure keep the defaults; loaded stays false */
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  /** Whether node detail lazy loading is enabled: requires both "loaded" and "database"
   *  Always false until the mode is confirmed (falls back to the full local spans; when in doubt, never lazy-load) */
  const lazyDetailEnabled = () => loaded.value && storageBackend.value === "database";

  return { storageBackend, loaded, lazyDetailEnabled, load };
});
