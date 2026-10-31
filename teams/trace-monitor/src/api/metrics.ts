// System API wrappers
import { api } from "@/utils/request";
import type { AppConfig } from "@/types";

// Runtime configuration: storage backend mode (file/database)
export async function fetchConfig(): Promise<AppConfig> {
  const { data } = await api.get<AppConfig>("/config");
  return data;
}
