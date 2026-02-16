<script setup lang="ts">
import type { LoadoutPort } from '@/services/api';

defineProps<{
  node: LoadoutPort
  color: string
  depth?: number
}>()
</script>

<template>
  <div>
    <component
      :is="node.component_uuid ? 'router-link' : 'div'"
      v-bind="node.component_uuid ? { to: `/components/${node.component_uuid}` } : {}"
      class="flex items-center gap-2 border rounded px-2 py-1 text-[11px] relative transition-colors"
      :class="[
        node.component_uuid ? 'hover:border-sv-accent/50 hover:bg-sv-panel-light/20 cursor-pointer' : 'opacity-50',
        (depth || 0) === 0 ? 'border-sv-border/40 px-2.5 py-1.5' : 'border-sv-border/20'
      ]"
    >
      <div v-if="(depth || 0) > 0" class="absolute -left-3 top-1/2 w-3 h-px bg-sv-border/30"></div>
      <span class="font-bold px-1 py-0.5 rounded shrink-0"
        :class="[color, (depth || 0) === 0 ? 'text-[10px] bg-sv-darker/50 px-1.5' : 'text-[9px] bg-sv-darker/30']">
        S{{ node.component_size || '?' }}
      </span>
      <div class="min-w-0 flex-1">
        <span :class="(depth || 0) === 0 ? 'text-xs font-medium text-sv-text-bright truncate block' : 'text-sv-text truncate'">
          {{ node.component_name || node.component_class_name || '—' }}
        </span>
        <div v-if="(depth || 0) === 0" class="text-[10px] text-sv-muted truncate">{{ node.port_name }}</div>
      </div>
      <span v-if="node.children && node.children.length > 0"
        class="text-[9px] px-1.5 py-0.5 rounded-full bg-sv-darker text-sv-muted shrink-0">
        {{ node.children.length }}×
      </span>
      <span class="text-[9px] px-1 py-0.5 rounded shrink-0"
        :class="(depth || 0) === 0 ? 'badge-blue text-[10px] ml-1' : 'bg-sv-darker/20 text-sv-muted/60'">
        {{ node.component_type || node.port_type || '?' }}
      </span>
    </component>
    <!-- Recursive children -->
    <div v-if="node.children && node.children.length > 0" class="ml-6 space-y-0.5">
      <LoadoutTreeNode
        v-for="child in node.children"
        :key="child.id || child.port_name"
        :node="child"
        :color="color"
        :depth="(depth || 0) + 1"
      />
    </div>
  </div>
</template>
