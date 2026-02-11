<script setup lang="ts">
defineProps<{ loading?: boolean }>()
</script>

<template>
  <div v-if="loading" class="flex items-center justify-center py-20">
    <div class="flex flex-col items-center gap-3">
      <div class="w-7 h-7 border-2 border-sv-accent/20 border-t-sv-accent rounded-full animate-spin" />
      <span class="text-sv-muted text-xs">Chargement…</span>
    </div>
  </div>
  <slot v-else />
</template>
