<script setup lang="ts">
// Metadata chips: lightweight badges for type/model/tool/duration/status
import { computed } from "vue";
import {
  Cpu,
  Tools,
  Timer,
  CircleCheck,
  CircleClose,
  PriceTag,
} from "@element-plus/icons-vue";
import type { Span } from "@/types";

const props = defineProps<{ span?: Span }>();

interface ChipItem {
  key: string;
  icon: unknown;
  text: string;
}

const items = computed<ChipItem[]>(() => {
  const s = props.span;
  if (!s) return [];
  const list: ChipItem[] = [];
  if (s.spanType) list.push({ key: "type", icon: PriceTag, text: s.spanType });
  if (s.model) list.push({ key: "model", icon: Cpu, text: s.model });
  if (s.toolName) list.push({ key: "tool", icon: Tools, text: s.toolName });
  if (s.durationMs != null)
    list.push({ key: "dur", icon: Timer, text: `${s.durationMs}ms` });
  if (s.status)
    list.push({
      key: "status",
      icon: s.status === "success" ? CircleCheck : CircleClose,
      text: s.status === "success" ? "Success" : "Failed",
    });
  return list;
});
</script>

<template>
  <div v-if="span" class="tm-scope tm-meta-chips">
    <span v-for="it in items" :key="it.key" class="tm-meta-chip">
      <el-icon :size="12"><component :is="it.icon" /></el-icon>
      {{ it.text }}
    </span>
  </div>
</template>

<style scoped lang="scss">
.tm-meta-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.tm-meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  background: var(--bg-subtle);
  color: var(--ink-mid);
  border: 1px solid var(--border-subtle);
}
</style>
