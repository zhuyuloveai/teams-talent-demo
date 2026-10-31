<script setup lang="ts">
// Single-row call tree node (recursive component): indent + connector lines + type icon + duration + expand arrow + status dot
import { ref } from "vue";
import type { TraceNode } from "@/types";

defineOptions({ name: "TraceTreeNode" });

const props = defineProps<{
  node: TraceNode;
  depth: number;
  selectedId: string | null;
  defaultOpen: boolean;
  hasSiblingBelow: boolean;
}>();

const emit = defineEmits<{ (e: "select", id: string): void }>();

const INDENT = 18;
const open = ref(props.defaultOpen);

const SPAN_ICON: Record<string, string> = {
  chain: "⛓",
  llm: "✦",
  tool: "⚙",
  agent: "◉",
  retriever: "⌕",
  span: "·",
};

function spanIcon(type?: string): string {
  return (type && SPAN_ICON[type]) || "·";
}
function isStrong(type?: string): boolean {
  return type === "chain" || type === "agent";
}
</script>

<template>
  <div class="tm-scope">
    <div
      class="tm-node"
      :class="{ selected: props.selectedId === props.node.span?.id }"
      @click="props.node.span && emit('select', props.node.span.id)"
    >
      <div class="tm-node-indent" :style="{ paddingLeft: props.depth * INDENT + 'px' }">
        <template v-for="i in props.depth" :key="i">
          <span
            class="tm-node-line"
            :style="{ borderLeftColor: i === 1 ? 'transparent' : undefined }"
          />
        </template>
        <span class="tm-node-line" :class="{ bottom: props.hasSiblingBelow }" />
      </div>
      <span
        class="tm-node-icon"
        :class="'type-' + (props.node.span?.spanType || 'span')"
        :title="props.node.span?.spanType"
      >
        {{ spanIcon(props.node.span?.spanType) }}
      </span>
      <span
        class="tm-node-name"
        :class="{ strong: isStrong(props.node.span?.spanType) }"
      >
        {{ props.node.span?.name }}
      </span>
      <!-- Action area (has children): duration + divider + arrow; the whole block toggles expand/collapse -->
      <span
        v-if="props.node.children.length > 0"
        class="tm-node-toggle"
        :class="{ open }"
        :title="open ? 'Collapse' : 'Expand'"
        @click.stop="open = !open"
      >
        <span v-if="props.node.span?.durationMs != null" class="tm-node-duration">
          {{ props.node.span?.durationMs }}ms
        </span>
        <span class="tm-node-divider" />
        <span class="tm-node-caret">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M4 6 L8 10.5 L12 6"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
      </span>
      <template v-else>
        <span v-if="props.node.span?.durationMs != null" class="tm-node-duration">
          {{ props.node.span?.durationMs }}ms
        </span>
        <span class="tm-node-spacer" />
      </template>
      <span
        class="tm-node-dot"
        :class="props.node.span?.status === 'success' ? 'success' : 'error'"
      />
    </div>
    <template v-if="open && props.node.children.length > 0">
      <TraceTreeNode
        v-for="(c, idx) in props.node.children"
        :key="c.span?.id"
        :node="c"
        :depth="props.depth + 1"
        :selected-id="props.selectedId"
        :default-open="props.defaultOpen"
        :has-sibling-below="idx < props.node.children.length - 1"
        @select="emit('select', $event)"
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
.tm-node {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 8px 4px 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.12s ease;
}
.tm-node:hover {
  background: var(--bg-surface-hover);
}
.tm-node.selected {
  background: var(--accent-soft);
}
.tm-node.selected:hover {
  background: var(--accent-soft-strong);
}
.tm-node-indent {
  display: flex;
  align-items: center;
  height: 24px;
  flex: none;
}
.tm-node-line {
  display: inline-block;
  width: 18px;
  height: 100%;
  border-left: 1px solid var(--border-strong);
  position: relative;
  flex: none;
}
.tm-node-line.bottom::after {
  content: "";
  position: absolute;
  left: -1px;
  bottom: 0;
  width: 18px;
  border-bottom: 1px solid var(--border-strong);
}
.tm-node-icon {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex: none;
  color: var(--ink-mid);
  border-radius: 5px;
  font-size: 11px;
}
.tm-node-icon.type-chain {
  background: rgba(90, 102, 240, 0.12);
  color: #5a66f0;
}
.tm-node-icon.type-llm {
  background: rgba(15, 157, 131, 0.12);
  color: var(--accent-strong);
}
.tm-node-icon.type-tool {
  background: rgba(240, 150, 60, 0.14);
  color: #d97a1f;
}
.tm-node-icon.type-agent {
  background: rgba(124, 93, 250, 0.12);
  color: #7c5dfa;
}
.tm-node-icon.type-retriever {
  background: rgba(56, 132, 235, 0.12);
  color: #3884eb;
}
.tm-node-icon.type-span {
  background: var(--bg-subtle);
  color: var(--ink-mid);
}
.tm-node-name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tm-node-name.strong {
  font-weight: 600;
  color: var(--ink-strong);
}
.tm-node-duration {
  color: var(--ink-weak);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* Action area: duration + divider + arrow; the whole hit area toggles expand/collapse */
.tm-node-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  cursor: pointer;
  border-radius: var(--radius-sm);
  padding: 1px 2px;
  transition: background 0.12s ease;

  .tm-node-duration {
    color: var(--ink-mid);
  }
}
.tm-node-toggle:hover {
  background: var(--accent-soft);

  .tm-node-duration {
    color: var(--accent-strong);
  }
}
.tm-node-divider {
  display: inline-block;
  width: 1px;
  height: 12px;
  background: var(--border-strong);
  flex: none;
}
.tm-node-caret {
  width: 20px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-strong);
  flex: none;

  svg {
    transition: transform 0.15s ease;
  }

  /* Collapsed = down arrow, expanded = up arrow (rotated 180°) */
  .tm-node-toggle.open & svg {
    transform: rotate(180deg);
  }
}
.tm-node-toggle:hover .tm-node-caret {
  color: var(--accent);
}
.tm-node-spacer {
  display: inline-block;
  width: 18px;
  flex: none;
}
.tm-node-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.tm-node-dot.success {
  background: var(--success);
  box-shadow: 0 0 0 3px var(--success-soft);
}
.tm-node-dot.error {
  background: var(--danger);
  box-shadow: 0 0 0 3px var(--danger-soft);
}
</style>
