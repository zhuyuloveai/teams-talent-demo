<script setup lang="ts">
// Embedded shell: drops the original top bar/sidebar and does not repeat a title bar.
// Project select / storage mode / refresh are merged into the list page toolbar; the detail page keeps "Back to list".
import { onMounted } from "vue";
import { useProjectStore } from "@/stores/project";
import { useAppConfigStore } from "@/stores/appConfig";

const projectStore = useProjectStore();
const appConfigStore = useAppConfigStore();

onMounted(() => {
  projectStore.load();
  appConfigStore.load();
  // Fall back to the iCode live collection project when there is no project history
  if (!projectStore.selected) projectStore.applySelection("icode");
});
</script>

<template>
  <div class="tm-app tm-embed">
    <main class="tm-embed-content">
      <router-view />
    </main>
  </div>
</template>

<style scoped lang="scss">
.tm-embed {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 0;
  background: var(--bg-canvas);
}
.tm-embed-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 24px 24px;
}
@media (max-width: 600px) {
  .tm-embed-content {
    padding: 12px;
  }
}
</style>
