<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  page: number
  pages: number
  total: number
}>()

defineEmits<{
  (e: 'update:page', page: number): void
}>()

// Show smart page range around current page
const visiblePages = computed(() => {
  const pages: number[] = []
  const total = props.pages
  const curr = props.page
  const delta = 2
  let start = Math.max(1, curr - delta)
  let end = Math.min(total, curr + delta)
  if (end - start < delta * 2) {
    if (start === 1) end = Math.min(total, start + delta * 2)
    else start = Math.max(1, end - delta * 2)
  }
  for (let i = start; i <= end; i++) pages.push(i)
  return pages
})
</script>

<template>
  <div class="flex items-center justify-between text-xs" v-if="pages > 1">
    <span class="text-sv-muted">{{ total.toLocaleString('fr-FR') }} résultats</span>
    <div class="flex items-center gap-0.5">
      <button
        class="btn-ghost px-2 py-1 text-xs rounded-md"
        :disabled="page <= 1"
        @click="$emit('update:page', page - 1)"
      >‹</button>
      <button v-if="visiblePages[0] > 1" class="px-2 py-1 text-sv-muted" @click="$emit('update:page', 1)">1</button>
      <span v-if="visiblePages[0] > 2" class="text-sv-muted/40 px-1">…</span>
      <button
        v-for="p in visiblePages"
        :key="p"
        class="px-2.5 py-1 rounded-md text-xs transition-all duration-150"
        :class="p === page
          ? 'bg-sv-accent/20 text-sv-accent font-semibold'
          : 'text-sv-muted hover:text-sv-text hover:bg-sv-border/40'"
        @click="$emit('update:page', p)"
      >{{ p }}</button>
      <span v-if="visiblePages[visiblePages.length - 1] < pages - 1" class="text-sv-muted/40 px-1">…</span>
      <button v-if="visiblePages[visiblePages.length - 1] < pages" class="px-2 py-1 text-sv-muted" @click="$emit('update:page', pages)">{{ pages }}</button>
      <button
        class="btn-ghost px-2 py-1 text-xs rounded-md"
        :disabled="page >= pages"
        @click="$emit('update:page', page + 1)"
      >›</button>
    </div>
  </div>
</template>
