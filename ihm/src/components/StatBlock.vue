<script setup lang="ts">
defineProps<{
  label: string
  value: string | number | null | undefined
  unit?: string
  color?: 'blue' | 'green' | 'amber' | 'red' | 'cyan' | 'purple' | 'default'
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
        'text-cyan-400': color === 'cyan',
        'text-purple-400': color === 'purple',
      }"
    >
      {{ value ?? '—' }}<span v-if="unit && value != null && value !== '—'" class="text-xs ml-0.5 text-sv-muted font-normal">{{ unit }}</span>
    </span>
  </div>
</template>
