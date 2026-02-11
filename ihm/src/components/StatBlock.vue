<script setup lang="ts">
defineProps<{
  label: string
  value: string | number | null | undefined
  unit?: string
  color?: 'blue' | 'green' | 'amber' | 'red' | 'default'
}>()
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <span class="stat-label">{{ label }}</span>
    <span
      class="stat-value"
      :class="{
        'text-blue-400': color === 'blue',
        'text-emerald-400': color === 'green',
        'text-amber-400': color === 'amber',
        'text-red-400': color === 'red',
      }"
    >
      {{ value ?? '—' }}<span v-if="unit && value != null" class="text-sm ml-0.5 text-sc-muted">{{ unit }}</span>
    </span>
  </div>
</template>
