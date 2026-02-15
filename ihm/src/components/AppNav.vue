<script setup lang="ts">
import { getComponents, getShips, type Component, type Ship } from '@/services/api';
import { debounce } from '@/utils/formatters';
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const route = useRoute()
const router = useRouter()

// ── Global search ──
const searchQuery = ref('')
const searchResults = ref<{ type: 'ship' | 'component'; name: string; uuid: string; extra: string }[]>([])
const searchOpen = ref(false)

async function doSearch(q: string) {
  if (q.length < 2) { searchResults.value = []; searchOpen.value = false; return }
  const [ships, comps] = await Promise.all([
    getShips({ search: q, limit: '5' }).catch(() => ({ data: [] as Ship[] })),
    getComponents({ search: q, limit: '5' }).catch(() => ({ data: [] as Component[] })),
  ])
  const results: typeof searchResults.value = []
  for (const s of ships.data) results.push({ type: 'ship', name: s.name, uuid: s.uuid, extra: s.manufacturer_code || '' })
  for (const c of comps.data) results.push({ type: 'component', name: c.name || c.class_name, uuid: c.uuid, extra: c.type || '' })
  searchResults.value = results
  searchOpen.value = results.length > 0
}
const debouncedSearch = debounce((q: string) => doSearch(q), 250)
watch(searchQuery, (q) => debouncedSearch(q))

function goToResult(r: typeof searchResults.value[number]) {
  searchOpen.value = false
  searchQuery.value = ''
  searchResults.value = []
  emit('close')
  if (r.type === 'ship') router.push(`/ships/${r.uuid}`)
  else router.push(`/components/${r.uuid}`)
}

const navSections = [
  {
    title: 'Database',
    links: [
      { to: '/ships', label: 'Ships', icon: '🚀' },
      { to: '/components', label: 'Components', icon: '⚙️' },
      { to: '/manufacturers', label: 'Manufacturers', icon: '🏭' },
      { to: '/paints', label: 'Paints', icon: '🎨' },
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

    <!-- Global Search -->
    <div class="px-3 pt-3 pb-1 relative">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search ships & components…"
        class="w-full bg-sv-dark/80 border border-sv-border/40 rounded-md px-3 py-1.5 text-xs text-sv-text placeholder-sv-muted/50 focus:outline-none focus:border-sv-accent/50 transition-colors"
        @focus="searchOpen = searchResults.length > 0"
        @blur="searchOpen = false"
      />
      <div v-if="searchOpen" class="absolute left-3 right-3 top-full mt-0.5 bg-sv-darker border border-sv-border/50 rounded-md shadow-xl z-50 max-h-64 overflow-y-auto">
        <button
          v-for="r in searchResults" :key="r.type + r.uuid"
          class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-sv-border/30 text-left transition-colors"
          @mousedown.prevent="goToResult(r)"
        >
          <span class="w-4 text-center">{{ r.type === 'ship' ? '🚀' : '⚙️' }}</span>
          <span class="text-sv-text-bright truncate flex-1">{{ r.name }}</span>
          <span class="text-sv-muted text-[10px]">{{ r.extra }}</span>
        </button>
      </div>
    </div>

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
