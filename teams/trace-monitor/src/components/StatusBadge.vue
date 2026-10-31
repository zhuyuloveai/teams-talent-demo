<script setup lang="ts">
// Status badge: success / error (rounded pill, semantic colors)
defineProps<{ status: string }>();
</script>

<template>
  <span class="tm-scope tm-status" :class="status === 'success' ? 'success' : 'error'">
    {{ status === "success" ? "Success" : "Failed" }}
  </span>
</template>

<style scoped lang="scss">
.tm-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  padding: 1px 10px;
  height: 22px;
  border-radius: 999px;
  line-height: 1;
}
.tm-status::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.tm-status.success {
  color: var(--success);
  background: var(--success-soft);
}
.tm-status.error {
  color: var(--danger);
  background: var(--danger-soft);
}
</style>
