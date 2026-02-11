<script setup lang="ts">
defineProps<{ loading?: boolean }>()
</script>

<template>
  <div v-if="loading" class="flex items-center justify-center py-20">
    <div class="flex flex-col items-center gap-3">
      <div class="w-8 h-8 border-2 border-sc-accent/30 border-t-sc-accent rounded-full animate-spin" />
      <span class="text-sc-muted text-sm">Chargement…</span>
    </div>
  </div>
  <slot v-else />
</template>
