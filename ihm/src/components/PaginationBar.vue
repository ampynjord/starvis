<script setup lang="ts">
defineProps<{
  page: number
  pages: number
  total: number
}>()

defineEmits<{
  (e: 'update:page', page: number): void
}>()
</script>

<template>
  <div class="flex items-center justify-between text-sm" v-if="pages > 1">
    <span class="text-sc-muted">{{ total }} résultats</span>
    <div class="flex items-center gap-1">
      <button
        class="btn-ghost px-2 py-1 text-xs"
        :disabled="page <= 1"
        @click="$emit('update:page', page - 1)"
      >← Préc.</button>
      <template v-for="p in Math.min(pages, 7)" :key="p">
        <button
          class="px-2.5 py-1 rounded text-xs transition-colors"
          :class="p === page ? 'bg-sc-accent text-white' : 'text-sc-muted hover:text-sc-text hover:bg-sc-border/50'"
          @click="$emit('update:page', p)"
        >{{ p }}</button>
      </template>
      <span v-if="pages > 7" class="text-sc-muted">…</span>
      <button
        class="btn-ghost px-2 py-1 text-xs"
        :disabled="page >= pages"
        @click="$emit('update:page', page + 1)"
      >Suiv. →</button>
    </div>
  </div>
</template>
