<script setup lang="ts">
import { useRoute } from 'vue-router';

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const route = useRoute()

const navSections = [
  {
    title: 'Database',
    links: [
      { to: '/ships', label: 'Ships', icon: '🚀' },
      { to: '/components', label: 'Components', icon: '⚙️' },
      { to: '/manufacturers', label: 'Manufacturers', icon: '🏭' },
      { to: '/shops', label: 'Shops', icon: '🏪' },
    ],
  },
  {
    title: 'Tools',
    links: [
      { to: '/compare', label: 'Compare', icon: '⚖️' },
      { to: '/loadout', label: 'Loadout Manager', icon: '🎯' },
      { to: '/hangar', label: 'Exec Hangar', icon: '🏛️' },
      { to: '/changelog', label: 'Changelog', icon: '📋' },
    ],
  },
]

function isActive(to: string) {
  if (to === '/') return route.path === '/'
  return route.path === to || route.path.startsWith(to + '/')
}
</script>

<template>
  <!-- Backdrop (mobile) -->
  <div
    v-if="props.open"
    class="fixed inset-0 bg-black/60 z-40 lg:hidden"
    @click="emit('close')"
  />

  <!-- Sidebar -->
  <aside
    class="fixed top-0 left-0 z-50 h-full w-56 bg-sv-darker/95 backdrop-blur-xl border-r border-sv-border/40 flex flex-col transition-transform duration-200 lg:translate-x-0"
    :class="props.open ? 'translate-x-0' : '-translate-x-full'"
  >
    <!-- Logo -->
    <router-link to="/" class="flex items-center gap-2.5 px-5 h-14 border-b border-sv-border/30" @click="emit('close')">
      <img src="/starvis-icon.svg" alt="" class="w-6 h-6" />
      <span class="text-sv-text-bright font-semibold tracking-tight">Starvis</span>
      <span class="ml-auto text-[10px] text-sv-muted font-mono">v1.0</span>
    </router-link>

    <!-- Nav sections -->
    <nav class="flex-1 overflow-y-auto py-3 px-3 space-y-5">
      <div v-for="section in navSections" :key="section.title">
        <div class="text-[10px] uppercase tracking-[0.15em] text-sv-muted/60 font-semibold px-3 mb-1.5">
          {{ section.title }}
        </div>
        <router-link
          v-for="link in section.links"
          :key="link.to"
          :to="link.to"
          :class="isActive(link.to) ? 'nav-link-active' : 'nav-link'"
          @click="emit('close')"
        >
          <span class="text-base w-5 text-center">{{ link.icon }}</span>
          <span>{{ link.label }}</span>
        </router-link>
      </div>
    </nav>

    <!-- Footer -->
    <div class="border-t border-sv-border/30 px-4 py-3">
      <div class="text-[10px] text-sv-muted/50 text-center">
        Open REST API<br />Star Citizen Data
      </div>
    </div>
  </aside>
</template>
