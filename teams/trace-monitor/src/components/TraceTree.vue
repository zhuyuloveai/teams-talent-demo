<script setup lang="ts">
// Call tree container: toolbar (expand/collapse all) + scrollable node list
import { ref } from "vue";
import type { TraceNode } from "@/types";
import TraceTreeNode from "@/components/TraceTreeNode.vue";

defineProps<{
  tree: TraceNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}>();

const allOpen = ref(false);
/** Remount counter: each "Expand all/Collapse all" increments it and remounts the whole tree, resetting every node's open state.
 *  A fixed key (open/closed) does not work: switching back from the default state keeps the key and the tree does not remount. */
const remountCounter = ref(0);

function toggleAll(open: boolean) {
  allOpen.value = open;
  remountCounter.value++;
}
</script>

<template>
  <div class="tm-scope tm-tree-wrap">
    <div class="tm-tree-toolbar">
      <el-button size="small" @click="toggleAll(true)">Expand all</el-button>
      <el-button size="small" @click="toggleAll(false)">Collapse all</el-button>
    </div>
    <div class="tm-tree-scroll">
      <el-empty v-if="tree.length === 0" description="No nodes" :image-size="60" />
      <div v-else :key="remountCounter">
        <TraceTreeNode
          v-for="(n, idx) in tree"
          :key="n.span?.id"
          :node="n"
          :depth="0"
          :selected-id="selectedId"
          :default-open="allOpen"
          :has-sibling-below="idx < tree.length - 1"
          @select="(id: string) => onSelect(id)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tm-tree-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.tm-tree-toolbar {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border-subtle);
  align-items: center;
}
.tm-tree-scroll {
  flex: 1;
  overflow: auto;
  padding: 8px 10px 16px;
}
</style>
