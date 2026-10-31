// Project state (Pinia): single-select filter in the compact toolbar
// ★ Project IDs come from the integrator/reporter; the frontend no longer manages project metadata
//   and only keeps a history of recently used project IDs in localStorage (key: "tm_recent_projects")
import { defineStore } from "pinia";
import { ref } from "vue";

const STORAGE_KEY = "tm_recent_projects";
const MAX_HISTORY = 8;
// Default project id written by iCode live collection (see TRACE2_PROJECT in start-icode-trace2.bat)
const DEFAULT_PROJECT = "icode";

function readHistory(): { id: string; name: string }[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeHistory(list: { id: string; name: string }[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* A failed write does not affect the main flow */
  }
}

export const useProjectStore = defineStore("project", () => {
  // History of recently used project IDs (name is the project ID itself, kept only for structural compatibility)
  const projects = ref<{ id: string; name: string }[]>([]);
  // Currently selected project id; starts with the most recent history entry, or the iCode collection project when there is no history
  const selected = ref<string>(readHistory()[0]?.id ?? DEFAULT_PROJECT);

  /** The project id currently in effect */
  const projectId = () => selected.value;

  /** Read recent history from localStorage (no backend request) */
  function load() {
    projects.value = readHistory();
  }

  /** Single entry point for the toolbar select: puts the id at the head of the history (deduplicated, at most 8 entries) */
  function applySelection(v: string) {
    selected.value = v;
    if (!v) return;
    const next = [{ id: v, name: v }, ...projects.value.filter((p) => p.id !== v)];
    projects.value = next.slice(0, MAX_HISTORY);
    writeHistory(projects.value);
  }

  return { projects, selected, projectId, load, applySelection };
});
