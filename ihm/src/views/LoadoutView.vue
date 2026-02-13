<script setup lang="ts">
import LoadingState from '@/components/LoadingState.vue'
import { calculateLoadout, getComponents, getShips, type Ship } from '@/services/api'
import { LOADOUT_CATEGORY_ORDER, getCategoryInfo } from '@/utils/constants'
import { debounce, fmt, pct, portLabel, useClickOutside } from '@/utils/formatters'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// ── State ──
const shipQuery = ref('')
const shipResults = ref<Ship[]>([])
const selectedShip = ref<Ship | null>(null)
const loadout = ref<any>(null)
const loading = ref(false)
const error = ref('')
const swaps = ref<{ portName: string; componentUuid: string }[]>([])

// Component swap search
const swapTarget = ref<string | null>(null) // port_name being swapped
const swapQuery = ref('')
const swapResults = ref<any[]>([])
const swapLoading = ref(false)
const swapTargetType = ref<string>('') // component type filter
const swapTargetMinSize = ref<number>(0) // port min size
const swapTargetMaxSize = ref<number>(0) // port max size
const swapCurrentComponent = ref<any>(null) // current component for delta preview

// Click-outside for ship search dropdown
const shipSearchRef = ref<HTMLElement | null>(null)
useClickOutside(shipSearchRef, () => { shipResults.value = [] })

// ── Collapse state for sections ──
const collapsedSections = ref<Set<string>>(new Set())
function toggleSection(key: string) {
  if (collapsedSections.value.has(key)) collapsedSections.value.delete(key)
  else collapsedSections.value.add(key)
}
function isSectionOpen(key: string) { return !collapsedSections.value.has(key) }

// ── Category mapping (Erkul-style) ─ only real component types from DB ──
// Now imported from @/utils/constants

// Backend now filters loadout to only relevant types, so minimal client filtering needed

// ── Ship search ──
async function searchShips(q: string) {
  if (q.length < 2) { shipResults.value = []; return }
  const res = await getShips({ search: q, limit: '8' })
  shipResults.value = res.data
}
const debouncedShipSearch = debounce((q: string) => searchShips(q), 300)

function selectShip(ship: Ship) {
  selectedShip.value = ship
  shipQuery.value = ship.name
  shipResults.value = []
  swaps.value = []
  router.replace({ params: { uuid: ship.uuid } })
  fetchLoadout(ship.uuid)
}

async function fetchLoadout(uuid: string) {
  loading.value = true
  error.value = ''
  try {
    const res = await calculateLoadout(uuid, swaps.value)
    loadout.value = res.data
  } catch (e: any) {
    error.value = e.message || 'Loadout error'
  } finally {
    loading.value = false
  }
}

// ── Grouped loadout items (Erkul-style categories) ──
const groupedLoadout = computed(() => {
  if (!loadout.value?.loadout) return []
  const groups: Record<string, { meta: any; items: any[] }> = {}

  for (const item of loadout.value.loadout) {
    // Items are already filtered by backend
    if (!item.component_uuid && !item.component_name) continue

    const type = item.component_type || 'Other'
    const meta = getCategoryInfo(type)
    if (meta.order >= 99) continue // Skip unknown types
    const groupKey = type

    if (!groups[groupKey]) groups[groupKey] = { meta, items: [] }
    groups[groupKey].items.push(item)
  }

  // Sort by LOADOUT_CATEGORY_ORDER
  return LOADOUT_CATEGORY_ORDER
    .filter(key => groups[key])
    .map(key => ({
      category: groups[key].meta.label,
      typeKey: key,
      icon: groups[key].meta.icon,
      color: groups[key].meta.color,
      label: groups[key].meta.label,
      items: groups[key].items,
    }))
})

// ── Swap component ──
function startSwap(item: any) {
  swapTarget.value = item.port_name
  swapTargetType.value = item.component_type || ''
  swapTargetMinSize.value = item.port_min_size || item.size || 0
  swapTargetMaxSize.value = item.port_max_size || item.size || 0
  swapCurrentComponent.value = item
  swapQuery.value = ''
  swapResults.value = []
}

function cancelSwap() {
  swapTarget.value = null
  swapQuery.value = ''
  swapResults.value = []
  swapCurrentComponent.value = null
}

async function searchSwapComponents(q: string) {
  if (q.length < 2) { swapResults.value = []; return }
  swapLoading.value = true
  try {
    const params: Record<string, string> = { search: q, limit: '20' }
    if (swapTargetType.value) params.type = swapTargetType.value
    // Filter by port-compatible sizes
    if (swapTargetMinSize.value > 0) params.min_size = String(swapTargetMinSize.value)
    if (swapTargetMaxSize.value > 0) params.max_size = String(swapTargetMaxSize.value)
    const res = await getComponents(params)
    swapResults.value = res.data
  } finally {
    swapLoading.value = false
  }
}
const debouncedSwapSearch = debounce((q: string) => searchSwapComponents(q), 300)

async function applySwap(component: any) {
  if (!swapTarget.value || !selectedShip.value) return
  const existing = swaps.value.findIndex(s => s.portName === swapTarget.value)
  if (existing !== -1) swaps.value[existing].componentUuid = component.uuid
  else swaps.value.push({ portName: swapTarget.value, componentUuid: component.uuid })
  cancelSwap()
  await fetchLoadout(selectedShip.value.uuid)
}

async function resetSwaps() {
  if (!selectedShip.value) return
  swaps.value = []
  await fetchLoadout(selectedShip.value.uuid)
}

function removeSwap(portName: string) {
  swaps.value = swaps.value.filter(s => s.portName !== portName)
  if (selectedShip.value) fetchLoadout(selectedShip.value.uuid)
}

// ── Formatting helpers (from shared utils) ──
// fmt, pct, portLabel imported from @/utils/formatters

/** Compute delta between swap candidate and current component for a given stat */
function delta(candidate: any, field: string): string {
  if (!swapCurrentComponent.value) return ''
  const oldVal = parseFloat(swapCurrentComponent.value[field]) || 0
  const newVal = parseFloat(candidate[field]) || 0
  const diff = newVal - oldVal
  if (Math.abs(diff) < 0.01) return ''
  const sign = diff > 0 ? '+' : ''
  return `${sign}${fmt(diff, 1)}`
}

function deltaClass(candidate: any, field: string, higherIsBetter = true): string {
  if (!swapCurrentComponent.value) return ''
  const oldVal = parseFloat(swapCurrentComponent.value[field]) || 0
  const newVal = parseFloat(candidate[field]) || 0
  const diff = newVal - oldVal
  if (Math.abs(diff) < 0.01) return 'text-sv-muted'
  if (higherIsBetter) return diff > 0 ? 'text-green-400' : 'text-red-400'
  return diff < 0 ? 'text-green-400' : 'text-red-400'
}

// ── URL swap persistence ──
function encodeSwapsToQuery(): string {
  if (swaps.value.length === 0) return ''
  return swaps.value.map(s => `${s.portName}:${s.componentUuid}`).join(',')
}

function decodeSwapsFromQuery(encoded: string): { portName: string; componentUuid: string }[] {
  if (!encoded) return []
  return encoded.split(',').map(pair => {
    const [portName, componentUuid] = pair.split(':')
    return { portName, componentUuid }
  }).filter(s => s.portName && s.componentUuid)
}

// Sync swaps to URL query params
watch(swaps, () => {
  const swapStr = encodeSwapsToQuery()
  const query = { ...route.query }
  if (swapStr) query.swaps = swapStr
  else delete query.swaps
  router.replace({ query })
}, { deep: true })

// ── Init from URL ──
onMounted(async () => {
  const uuid = route.params.uuid as string
  if (uuid) {
    loading.value = true
    try {
      // Restore swaps from URL query params
      const swapStr = route.query.swaps as string
      if (swapStr) {
        swaps.value = decodeSwapsFromQuery(swapStr)
      }

      const res = await calculateLoadout(uuid, swaps.value)
      loadout.value = res.data
      if (res.data?.ship) {
        selectedShip.value = { uuid: res.data.ship.uuid, name: res.data.ship.name } as Ship
        shipQuery.value = res.data.ship.name
      }
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }
})
</script>

<template>
  <div class="space-y-4">

    <!-- ═══ Ship Picker ═══ -->
    <div class="card p-4 relative z-20" ref="shipSearchRef">
      <div class="flex items-center gap-3">
        <div class="flex-1 relative">
          <div class="flex items-center gap-2 mb-1.5">
            <span class="text-lg">🎯</span>
            <h1 class="text-sm font-bold text-sv-text-bright uppercase tracking-wider">Loadout Manager</h1>
          </div>
          <input
            v-model="shipQuery"
            @input="debouncedShipSearch(shipQuery)"
            class="input w-full"
            placeholder="Search a ship…"
          />
          <!-- Dropdown -->
          <div v-if="shipResults.length" class="absolute z-50 left-0 right-0 mt-1 bg-sv-panel border border-sv-border rounded-lg shadow-2xl max-h-56 overflow-y-auto">
            <div v-for="s in shipResults" :key="s.uuid" @click="selectShip(s)"
              class="px-3 py-2.5 hover:bg-sv-accent/10 cursor-pointer text-xs border-b border-sv-border/20 last:border-0 flex items-center justify-between">
              <div>
                <span class="text-sv-text-bright font-medium">{{ s.name }}</span>
                <span class="text-sv-muted ml-2 text-[10px]">{{ s.manufacturer_code }}</span>
              </div>
              <span class="text-[10px] text-sv-muted">{{ s.role }}</span>
            </div>
          </div>
        </div>
        <!-- Reset button -->
        <button v-if="swaps.length" @click="resetSwaps"
          class="px-3 py-2 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 transition whitespace-nowrap">
          ↺ Reset ({{ swaps.length }})
        </button>
      </div>
    </div>

    <!-- ═══ Error ═══ -->
    <div v-if="error" class="card border-red-500/50 p-3 text-red-400 text-sm">{{ error }}</div>

    <!-- ═══ Main Content ═══ -->
    <LoadingState :loading="loading">
      <div v-if="loadout" class="grid grid-cols-1 lg:grid-cols-12 gap-4">

        <!-- ═══════════════ LEFT: Components Panel ═══════════════ -->
        <div class="lg:col-span-7 xl:col-span-8 space-y-3">

          <!-- Ship header bar -->
          <div class="card p-4">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-lg font-bold text-sv-text-bright">{{ loadout.ship.name }}</h2>
                <div class="text-[10px] text-sv-muted font-mono">{{ loadout.ship.class_name }}</div>
              </div>
              <div class="flex gap-4 text-center">
                <div>
                  <div class="text-[10px] text-sv-muted uppercase">HP</div>
                  <div class="text-sm font-bold text-emerald-400 font-mono">{{ fmt(loadout.stats.hull.total_hp) }}</div>
                </div>
                <div>
                  <div class="text-[10px] text-sv-muted uppercase">Shield</div>
                  <div class="text-sm font-bold text-blue-400 font-mono">{{ fmt(loadout.stats.shields.total_hp) }}</div>
                </div>
                <div>
                  <div class="text-[10px] text-sv-muted uppercase">DPS</div>
                  <div class="text-sm font-bold text-red-400 font-mono">{{ fmt(loadout.stats.weapons.total_dps) }}</div>
                </div>
                <div>
                  <div class="text-[10px] text-sv-muted uppercase">SCM</div>
                  <div class="text-sm font-bold text-sv-accent font-mono">{{ fmt(loadout.stats.mobility.scm_speed) }}</div>
                </div>
                <div class="hidden sm:block">
                  <div class="text-[10px] text-sv-muted uppercase">Mass</div>
                  <div class="text-sm font-bold text-sv-text font-mono">{{ fmt(loadout.stats.mobility.mass) }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Component categories (Erkul-style) -->
          <div v-for="group in groupedLoadout" :key="group.category" class="card overflow-hidden">
            <!-- Category header -->
            <button @click="toggleSection(group.category)"
              class="w-full flex items-center justify-between px-4 py-2.5 hover:bg-sv-panel-light/30 transition-colors"
              :class="{
                'bg-red-500/5': group.color === 'red',
                'bg-blue-500/5': group.color === 'blue',
                'bg-orange-500/5': group.color === 'orange',
                'bg-yellow-500/5': group.color === 'yellow',
                'bg-cyan-500/5': group.color === 'cyan',
                'bg-purple-500/5': group.color === 'purple',
                'bg-green-500/5': group.color === 'green',
                'bg-emerald-500/5': group.color === 'emerald',
              }">
              <div class="flex items-center gap-2">
                <span class="text-sm">{{ group.icon }}</span>
                <span class="text-[11px] font-bold uppercase tracking-wider"
                  :class="{
                    'text-red-400': group.color === 'red',
                    'text-blue-400': group.color === 'blue',
                    'text-orange-400': group.color === 'orange',
                    'text-yellow-400': group.color === 'yellow',
                    'text-cyan-400': group.color === 'cyan',
                    'text-purple-400': group.color === 'purple',
                    'text-green-400': group.color === 'green',
                    'text-emerald-400': group.color === 'emerald',
                  }">
                  {{ group.category }}
                </span>
                <span class="text-[10px] text-sv-muted bg-sv-darker/50 px-1.5 py-0.5 rounded">{{ group.items.length }}</span>
              </div>
              <svg class="w-3.5 h-3.5 text-sv-muted transition-transform" :class="{ 'rotate-180': isSectionOpen(group.category) }" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>

            <!-- Components list -->
            <div v-if="isSectionOpen(group.category)">
              <div v-for="item in group.items" :key="item.port_name"
                class="flex items-center gap-3 px-4 py-2 border-t border-sv-border/20 hover:bg-sv-panel-light/20 transition-colors group/item">

                <!-- Size badge -->
                <div class="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold shrink-0"
                  :class="item.swapped ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-sv-darker/60 text-sv-muted border border-sv-border/30'">
                  S{{ item.component_size || '?' }}
                </div>

                <!-- Component info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-medium truncate" :class="item.swapped ? 'text-amber-300' : 'text-sv-text-bright'">
                      {{ item.display_name || item.component_name || 'Empty' }}
                    </span>
                    <span v-if="item.grade" class="text-[9px] px-1 py-0.5 rounded bg-sv-darker/50 text-sv-muted border border-sv-border/20">
                      {{ item.grade }}
                    </span>
                    <span v-if="item.swapped" class="text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400">
                      SWAP
                    </span>
                  </div>
                  <div class="text-[10px] text-sv-muted truncate">{{ portLabel(item.port_name) }}</div>
                </div>

                <!-- Inline stats (type-specific) -->
                <div class="hidden sm:flex items-center gap-3 text-[10px] text-sv-muted font-mono shrink-0">
                  <template v-if="item.weapon_dps">
                    <span class="text-red-400">{{ fmt(item.weapon_dps, 0) }} DPS</span>
                    <span v-if="item.weapon_range">{{ fmt(item.weapon_range, 0) }}m</span>
                  </template>
                  <template v-if="item.shield_hp">
                    <span class="text-blue-400">{{ fmt(item.shield_hp, 0) }} HP</span>
                    <span class="text-blue-300">{{ fmt(item.shield_regen, 0) }}/s</span>
                  </template>
                  <template v-if="item.power_output">
                    <span class="text-yellow-400">{{ fmt(item.power_output, 0) }} pwr</span>
                  </template>
                  <template v-if="item.cooling_rate">
                    <span class="text-cyan-400">{{ fmt(item.cooling_rate, 0) }} cool</span>
                  </template>
                  <template v-if="item.qd_speed">
                    <span class="text-purple-400">{{ fmt(item.qd_speed) }} m/s</span>
                  </template>
                  <template v-if="item.cm_ammo">
                    <span class="text-emerald-400">{{ item.cm_ammo }} rounds</span>
                  </template>
                  <template v-if="item.radar_range">
                    <span class="text-green-400">{{ fmt(item.radar_range, 0) }}m</span>
                  </template>
                  <template v-if="item.emp_damage">
                    <span class="text-purple-400">{{ fmt(item.emp_damage, 0) }} dmg</span>
                    <span v-if="item.emp_radius" class="text-purple-300">{{ fmt(item.emp_radius, 0) }}m</span>
                  </template>
                  <template v-if="item.qig_jammer_range">
                    <span class="text-purple-400">{{ fmt(item.qig_jammer_range, 0) }}m</span>
                    <span v-if="item.qig_snare_radius" class="text-purple-300">⌀{{ fmt(item.qig_snare_radius, 0) }}m</span>
                  </template>
                </div>

                <!-- Swap / Reset buttons -->
                <div class="flex items-center gap-1 shrink-0">
                  <button @click="startSwap(item)"
                    class="opacity-0 group-hover/item:opacity-100 transition-opacity p-1 rounded hover:bg-sv-accent/10 text-sv-muted hover:text-sv-accent"
                    title="Swap component">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  </button>
                  <button v-if="item.swapped" @click="removeSwap(item.port_name)"
                    class="p-1 rounded hover:bg-red-500/10 text-sv-muted hover:text-red-400 transition"
                    title="Restore original">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══════════════ RIGHT: Stats Sidebar ═══════════════ -->
        <div class="lg:col-span-5 xl:col-span-4 space-y-3 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto scrollbar-thin">

          <!-- Weapons breakdown -->
          <div class="card overflow-hidden">
            <div class="px-4 py-2 bg-red-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-red-400 uppercase tracking-wider">🔫 Weapons</span>
            </div>
            <div class="p-3 space-y-2">
              <div class="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div class="text-[9px] text-sv-muted uppercase">DPS</div>
                  <div class="text-sm font-bold text-red-400 font-mono">{{ fmt(loadout.stats.weapons.total_dps) }}</div>
                </div>
                <div>
                  <div class="text-[9px] text-sv-muted uppercase">Burst</div>
                  <div class="text-sm font-bold text-red-300 font-mono">{{ fmt(loadout.stats.weapons.total_burst_dps) }}</div>
                </div>
                <div>
                  <div class="text-[9px] text-sv-muted uppercase">Sustained</div>
                  <div class="text-sm font-bold text-red-200 font-mono">{{ fmt(loadout.stats.weapons.total_sustained_dps) }}</div>
                </div>
              </div>
              <!-- Per-weapon detail table -->
              <table v-if="loadout.stats.weapons.details?.length" class="w-full text-[10px] mt-2">
                <thead>
                  <tr class="text-sv-muted border-b border-sv-border/20">
                    <th class="text-left py-1 font-medium">Name</th>
                    <th class="text-center py-1 font-medium">S</th>
                    <th class="text-right py-1 font-medium">DPS</th>
                    <th class="text-right py-1 font-medium hidden sm:table-cell">Range</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(w, i) in loadout.stats.weapons.details" :key="i"
                    class="border-b border-sv-border/10 hover:bg-sv-panel-light/20">
                    <td class="py-1 text-sv-text-bright truncate max-w-[120px]">{{ w.name }}</td>
                    <td class="py-1 text-center text-sv-muted">{{ w.size }}</td>
                    <td class="py-1 text-right text-red-400 font-mono">{{ fmt(w.dps) }}</td>
                    <td class="py-1 text-right text-sv-muted font-mono hidden sm:table-cell">{{ fmt(w.range) }}m</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Shields -->
          <div class="card overflow-hidden">
            <div class="px-4 py-2 bg-blue-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-blue-400 uppercase tracking-wider">🛡️ Shields</span>
            </div>
            <div class="p-3 space-y-2">
              <div class="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div class="text-[9px] text-sv-muted uppercase">Total HP</div>
                  <div class="text-sm font-bold text-blue-400 font-mono">{{ fmt(loadout.stats.shields.total_hp) }}</div>
                </div>
                <div>
                  <div class="text-[9px] text-sv-muted uppercase">Regen</div>
                  <div class="text-sm font-bold text-blue-300 font-mono">{{ fmt(loadout.stats.shields.total_regen) }}/s</div>
                </div>
                <div>
                  <div class="text-[9px] text-sv-muted uppercase">Charge</div>
                  <div class="text-sm font-bold text-blue-200 font-mono">{{ loadout.stats.shields.time_to_charge || '—' }}s</div>
                </div>
              </div>
              <!-- Per-shield details -->
              <table v-if="loadout.stats.shields.details?.length" class="w-full text-[10px] mt-2">
                <thead>
                  <tr class="text-sv-muted border-b border-sv-border/20">
                    <th class="text-left py-1 font-medium">Name</th>
                    <th class="text-center py-1 font-medium">S</th>
                    <th class="text-right py-1 font-medium">HP</th>
                    <th class="text-right py-1 font-medium">Regen</th>
                    <th class="text-right py-1 font-medium hidden sm:table-cell">Delay</th>
                    <th class="text-right py-1 font-medium hidden sm:table-cell">Hard.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(s, i) in loadout.stats.shields.details" :key="i"
                    class="border-b border-sv-border/10 hover:bg-sv-panel-light/20">
                    <td class="py-1 text-sv-text-bright truncate max-w-[120px]">{{ s.name }}</td>
                    <td class="py-1 text-center text-sv-muted">{{ s.size }}</td>
                    <td class="py-1 text-right text-blue-400 font-mono">{{ fmt(s.hp) }}</td>
                    <td class="py-1 text-right text-blue-300 font-mono">{{ fmt(s.regen) }}/s</td>
                    <td class="py-1 text-right text-blue-200 font-mono hidden sm:table-cell">{{ s.regen_delay ? fmt(s.regen_delay, 1) + 's' : '—' }}</td>
                    <td class="py-1 text-right text-blue-200 font-mono hidden sm:table-cell">{{ s.hardening ? pct(s.hardening) : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Missiles -->
          <div class="card overflow-hidden">
            <div class="px-4 py-2 bg-orange-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-orange-400 uppercase tracking-wider">🚀 Missiles</span>
            </div>
            <div class="p-3">
              <div class="grid grid-cols-2 gap-2 text-center">
                <div>
                  <div class="text-[9px] text-sv-muted uppercase">Count</div>
                  <div class="text-sm font-bold text-orange-400 font-mono">{{ loadout.stats.missiles.count }}</div>
                </div>
                <div>
                  <div class="text-[9px] text-sv-muted uppercase">Total Damage</div>
                  <div class="text-sm font-bold text-orange-300 font-mono">{{ fmt(loadout.stats.missiles.total_damage) }}</div>
                </div>
              </div>
              <table v-if="loadout.stats.missiles.details?.length" class="w-full text-[10px] mt-2">
                <thead>
                  <tr class="text-sv-muted border-b border-sv-border/20">
                    <th class="text-left py-1 font-medium">Name</th>
                    <th class="text-center py-1 font-medium">S</th>
                    <th class="text-right py-1 font-medium">Damage</th>
                    <th class="text-right py-1 font-medium hidden sm:table-cell">Speed</th>
                    <th class="text-right py-1 font-medium hidden sm:table-cell">Range</th>
                    <th class="text-right py-1 font-medium hidden sm:table-cell">Lock</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(m, i) in loadout.stats.missiles.details" :key="i"
                    class="border-b border-sv-border/10 hover:bg-sv-panel-light/20">
                    <td class="py-1 text-sv-text-bright truncate max-w-[100px]">{{ m.name }}</td>
                    <td class="py-1 text-center text-sv-muted">{{ m.size }}</td>
                    <td class="py-1 text-right text-orange-400 font-mono">{{ fmt(m.damage) }}</td>
                    <td class="py-1 text-right text-sv-muted font-mono hidden sm:table-cell">{{ m.speed ? fmt(m.speed, 0) + ' m/s' : '—' }}</td>
                    <td class="py-1 text-right text-sv-muted font-mono hidden sm:table-cell">{{ m.range ? fmt(m.range, 0) + 'm' : '—' }}</td>
                    <td class="py-1 text-right text-sv-muted font-mono hidden sm:table-cell">{{ m.lock_time ? fmt(m.lock_time, 1) + 's' : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Countermeasures -->
          <div v-if="loadout.stats.countermeasures" class="card overflow-hidden">
            <div class="px-4 py-2 bg-emerald-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">🎯 Countermeasures</span>
            </div>
            <div class="p-3">
              <div class="grid grid-cols-2 gap-2 text-center">
                <div>
                  <div class="text-[9px] text-sv-muted uppercase">Flares</div>
                  <div class="text-sm font-bold text-emerald-400 font-mono">{{ loadout.stats.countermeasures.flare_count }}</div>
                </div>
                <div>
                  <div class="text-[9px] text-sv-muted uppercase">Chaff</div>
                  <div class="text-sm font-bold text-emerald-300 font-mono">{{ loadout.stats.countermeasures.chaff_count }}</div>
                </div>
              </div>
              <div v-if="loadout.stats.countermeasures.details?.length" class="mt-2 space-y-1">
                <div v-for="(cm, i) in loadout.stats.countermeasures.details" :key="i"
                  class="flex items-center justify-between text-[10px] px-1">
                  <span class="text-sv-text-bright">{{ cm.name }}</span>
                  <div class="flex items-center gap-2">
                    <span class="text-[9px] px-1.5 py-0.5 rounded" :class="cm.type === 'Flare' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'">
                      {{ cm.type }}
                    </span>
                    <span class="text-sv-muted font-mono">{{ cm.ammo_count }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Hull & Armor -->
          <div class="card overflow-hidden">
            <div class="px-4 py-2 bg-emerald-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">💚 Hull & Armor</span>
            </div>
            <div class="p-3 space-y-2">
              <div class="grid grid-cols-2 gap-2 text-center">
                <div>
                  <div class="text-[9px] text-sv-muted uppercase">Hull HP</div>
                  <div class="text-sm font-bold text-emerald-400 font-mono">{{ fmt(loadout.stats.hull.total_hp) }}</div>
                </div>
                <div>
                  <div class="text-[9px] text-sv-muted uppercase">EHP</div>
                  <div class="text-sm font-bold text-emerald-300 font-mono">{{ fmt(loadout.stats.hull.ehp) }}</div>
                </div>
              </div>
              <!-- Cross Section -->
              <div v-if="loadout.stats.hull.cross_section_x || loadout.stats.hull.cross_section_y || loadout.stats.hull.cross_section_z"
                class="grid grid-cols-3 gap-2 text-center mt-2 pt-2 border-t border-sv-border/20">
                <div>
                  <div class="text-[9px] text-sv-muted uppercase">Length</div>
                  <div class="text-[11px] font-mono text-sv-text-bright">{{ fmt(loadout.stats.hull.cross_section_x, 1) }}m</div>
                </div>
                <div>
                  <div class="text-[9px] text-sv-muted uppercase">Beam</div>
                  <div class="text-[11px] font-mono text-sv-text-bright">{{ fmt(loadout.stats.hull.cross_section_y, 1) }}m</div>
                </div>
                <div>
                  <div class="text-[9px] text-sv-muted uppercase">Height</div>
                  <div class="text-[11px] font-mono text-sv-text-bright">{{ fmt(loadout.stats.hull.cross_section_z, 1) }}m</div>
                </div>
              </div>
              <div class="space-y-1.5 mt-2">
                <div class="flex items-center justify-between text-[10px]">
                  <span class="text-sv-muted">Physical</span>
                  <div class="flex items-center gap-2">
                    <div class="w-16 h-1.5 bg-sv-darker rounded-full overflow-hidden">
                      <div class="h-full bg-emerald-500 rounded-full" :style="{ width: pct(1 - (loadout.stats.armor.physical || 0)) }"></div>
                    </div>
                    <span class="text-emerald-400 font-mono w-10 text-right">{{ pct(1 - (loadout.stats.armor.physical || 0)) }}</span>
                  </div>
                </div>
                <div class="flex items-center justify-between text-[10px]">
                  <span class="text-sv-muted">Energy</span>
                  <div class="flex items-center gap-2">
                    <div class="w-16 h-1.5 bg-sv-darker rounded-full overflow-hidden">
                      <div class="h-full bg-blue-500 rounded-full" :style="{ width: pct(1 - (loadout.stats.armor.energy || 0)) }"></div>
                    </div>
                    <span class="text-blue-400 font-mono w-10 text-right">{{ pct(1 - (loadout.stats.armor.energy || 0)) }}</span>
                  </div>
                </div>
                <div class="flex items-center justify-between text-[10px]">
                  <span class="text-sv-muted">Distortion</span>
                  <div class="flex items-center gap-2">
                    <div class="w-16 h-1.5 bg-sv-darker rounded-full overflow-hidden">
                      <div class="h-full bg-purple-500 rounded-full" :style="{ width: pct(1 - (loadout.stats.armor.distortion || 0)) }"></div>
                    </div>
                    <span class="text-purple-400 font-mono w-10 text-right">{{ pct(1 - (loadout.stats.armor.distortion || 0)) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Mobility -->
          <div class="card overflow-hidden">
            <div class="px-4 py-2 bg-sv-accent/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-sv-accent uppercase tracking-wider">🏎️ Mobility</span>
            </div>
            <div class="p-3">
              <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                <div class="flex justify-between">
                  <span class="text-sv-muted">SCM</span>
                  <span class="text-sv-text-bright font-mono">{{ fmt(loadout.stats.mobility.scm_speed) }} m/s</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sv-muted">Max</span>
                  <span class="text-sv-text-bright font-mono">{{ fmt(loadout.stats.mobility.max_speed) }} m/s</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sv-muted">Boost Fwd</span>
                  <span class="text-sv-text-bright font-mono">{{ fmt(loadout.stats.mobility.boost_forward) }} m/s</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sv-muted">Boost Bwd</span>
                  <span class="text-sv-text-bright font-mono">{{ fmt(loadout.stats.mobility.boost_backward) }} m/s</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sv-muted">Pitch</span>
                  <span class="text-sv-text-bright font-mono">{{ fmt(loadout.stats.mobility.pitch) }}°/s</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sv-muted">Yaw</span>
                  <span class="text-sv-text-bright font-mono">{{ fmt(loadout.stats.mobility.yaw) }}°/s</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sv-muted">Roll</span>
                  <span class="text-sv-text-bright font-mono">{{ fmt(loadout.stats.mobility.roll) }}°/s</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sv-muted">Mass</span>
                  <span class="text-sv-text-bright font-mono">{{ fmt(loadout.stats.mobility.mass) }} kg</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Quantum Drive -->
          <div class="card overflow-hidden">
            <div class="px-4 py-2 bg-purple-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-purple-400 uppercase tracking-wider">💫 Quantum Drive</span>
            </div>
            <div class="p-3">
              <div class="text-xs text-sv-text-bright font-medium mb-2">{{ loadout.stats.quantum.drive_name || '—' }}</div>
              <div class="grid grid-cols-3 gap-2 text-center text-[10px]">
                <div>
                  <div class="text-sv-muted">Speed</div>
                  <div class="text-purple-400 font-mono font-medium">{{ fmt(loadout.stats.quantum.speed) }} m/s</div>
                </div>
                <div>
                  <div class="text-sv-muted">Spool</div>
                  <div class="text-purple-300 font-mono font-medium">{{ loadout.stats.quantum.spool_time }}s</div>
                </div>
                <div>
                  <div class="text-sv-muted">Fuel Cap.</div>
                  <div class="text-purple-200 font-mono font-medium">{{ loadout.stats.quantum.fuel_capacity }}L</div>
                </div>
              </div>
              <!-- Extended QD stats -->
              <div v-if="loadout.stats.quantum.cooldown || loadout.stats.quantum.fuel_rate || loadout.stats.quantum.range || loadout.stats.quantum.tuning_rate || loadout.stats.quantum.alignment_rate || loadout.stats.quantum.disconnect_range"
                class="grid grid-cols-3 gap-2 text-center text-[10px] mt-2 pt-2 border-t border-sv-border/20">
                <div v-if="loadout.stats.quantum.cooldown">
                  <div class="text-sv-muted">Cooldown</div>
                  <div class="text-purple-300 font-mono font-medium">{{ fmt(loadout.stats.quantum.cooldown, 1) }}s</div>
                </div>
                <div v-if="loadout.stats.quantum.fuel_rate">
                  <div class="text-sv-muted">Fuel Rate</div>
                  <div class="text-purple-300 font-mono font-medium">{{ fmt(loadout.stats.quantum.fuel_rate) }}/s</div>
                </div>
                <div v-if="loadout.stats.quantum.range">
                  <div class="text-sv-muted">Range</div>
                  <div class="text-purple-300 font-mono font-medium">{{ fmt(loadout.stats.quantum.range / 1000000, 1) }} Gm</div>
                </div>
                <div v-if="loadout.stats.quantum.tuning_rate">
                  <div class="text-sv-muted">Tuning</div>
                  <div class="text-purple-200 font-mono font-medium">{{ fmt(loadout.stats.quantum.tuning_rate, 2) }}</div>
                </div>
                <div v-if="loadout.stats.quantum.alignment_rate">
                  <div class="text-sv-muted">Alignment</div>
                  <div class="text-purple-200 font-mono font-medium">{{ fmt(loadout.stats.quantum.alignment_rate, 2) }}</div>
                </div>
                <div v-if="loadout.stats.quantum.disconnect_range">
                  <div class="text-sv-muted">Disconnect</div>
                  <div class="text-purple-200 font-mono font-medium">{{ fmt(loadout.stats.quantum.disconnect_range / 1000, 0) }} km</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Signatures -->
          <div class="card overflow-hidden">
            <div class="px-4 py-2 bg-emerald-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">📡 Signatures</span>
            </div>
            <div class="p-3 space-y-1.5">
              <div class="flex items-center justify-between text-[10px]">
                <span class="text-sv-muted">IR (Infrared)</span>
                <div class="flex items-center gap-2">
                  <div class="w-20 h-1.5 bg-sv-darker rounded-full overflow-hidden">
                    <div class="h-full bg-red-500 rounded-full" :style="{ width: Math.min(100, (loadout.stats.signatures.ir || 0) * 50) + '%' }"></div>
                  </div>
                  <span class="text-red-400 font-mono w-8 text-right">{{ loadout.stats.signatures.ir?.toFixed(2) || '—' }}</span>
                </div>
              </div>
              <div class="flex items-center justify-between text-[10px]">
                <span class="text-sv-muted">EM (Electromag.)</span>
                <div class="flex items-center gap-2">
                  <div class="w-20 h-1.5 bg-sv-darker rounded-full overflow-hidden">
                    <div class="h-full bg-blue-500 rounded-full" :style="{ width: Math.min(100, (loadout.stats.signatures.em || 0) * 50) + '%' }"></div>
                  </div>
                  <span class="text-blue-400 font-mono w-8 text-right">{{ loadout.stats.signatures.em?.toFixed(2) || '—' }}</span>
                </div>
              </div>
              <div class="flex items-center justify-between text-[10px]">
                <span class="text-sv-muted">CS (Cross-section)</span>
                <div class="flex items-center gap-2">
                  <div class="w-20 h-1.5 bg-sv-darker rounded-full overflow-hidden">
                    <div class="h-full bg-amber-500 rounded-full" :style="{ width: Math.min(100, (loadout.stats.signatures.cs || 0) * 50) + '%' }"></div>
                  </div>
                  <span class="text-amber-400 font-mono w-8 text-right">{{ loadout.stats.signatures.cs?.toFixed(2) || '—' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Power & Thermal -->
          <div class="card overflow-hidden">
            <div class="px-4 py-2 bg-yellow-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-yellow-400 uppercase tracking-wider">⚡ Power & Thermal</span>
            </div>
            <div class="p-3 space-y-2">
              <div class="grid grid-cols-2 gap-3 text-center text-[10px]">
                <div>
                  <div class="text-sv-muted">Power Output</div>
                  <div class="text-yellow-400 font-mono font-medium text-sm">{{ fmt(loadout.stats.power.total_output) }}</div>
                </div>
                <div>
                  <div class="text-sv-muted">Power Draw</div>
                  <div class="text-yellow-300 font-mono font-medium text-sm">{{ fmt(loadout.stats.power.total_draw) }}</div>
                </div>
              </div>
              <div class="flex items-center justify-between text-[10px] px-1">
                <span class="text-sv-muted">Balance</span>
                <span class="font-mono font-medium" :class="loadout.stats.power.balance >= 0 ? 'text-emerald-400' : 'text-red-400'">
                  {{ loadout.stats.power.balance >= 0 ? '+' : '' }}{{ fmt(loadout.stats.power.balance) }}
                </span>
              </div>
              <div class="border-t border-sv-border/20 pt-2 mt-2 grid grid-cols-2 gap-3 text-center text-[10px]">
                <div>
                  <div class="text-sv-muted">Cooling Rate</div>
                  <div class="text-cyan-400 font-mono font-medium text-sm">{{ fmt(loadout.stats.thermal.total_cooling_rate) }}</div>
                </div>
                <div>
                  <div class="text-sv-muted">Heat Gen.</div>
                  <div class="text-cyan-300 font-mono font-medium text-sm">{{ fmt(loadout.stats.thermal.total_heat_generation) }}</div>
                </div>
              </div>
              <div class="flex items-center justify-between text-[10px] px-1">
                <span class="text-sv-muted">Thermal Balance</span>
                <span class="font-mono font-medium" :class="loadout.stats.thermal.balance >= 0 ? 'text-emerald-400' : 'text-red-400'">
                  {{ loadout.stats.thermal.balance >= 0 ? '+' : '' }}{{ fmt(loadout.stats.thermal.balance) }}
                </span>
              </div>
              <!-- Power plant details -->
              <table v-if="loadout.stats.power.details?.length" class="w-full text-[10px] mt-1">
                <thead>
                  <tr class="text-sv-muted border-b border-sv-border/20">
                    <th class="text-left py-1 font-medium">Power Plant</th>
                    <th class="text-right py-1 font-medium">Output</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(p, i) in loadout.stats.power.details" :key="i"
                    class="border-b border-sv-border/10">
                    <td class="py-1 text-sv-text-bright truncate">{{ p.name }}</td>
                    <td class="py-1 text-right text-yellow-400 font-mono">{{ fmt(p.output) }}</td>
                  </tr>
                </tbody>
              </table>
              <!-- Cooler details -->
              <table v-if="loadout.stats.thermal.details?.length" class="w-full text-[10px] mt-1">
                <thead>
                  <tr class="text-sv-muted border-b border-sv-border/20">
                    <th class="text-left py-1 font-medium">Cooler</th>
                    <th class="text-right py-1 font-medium">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(c, i) in loadout.stats.thermal.details" :key="i"
                    class="border-b border-sv-border/10">
                    <td class="py-1 text-sv-text-bright truncate">{{ c.name }}</td>
                    <td class="py-1 text-right text-cyan-400 font-mono">{{ fmt(c.cooling_rate) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Fuel -->
          <div class="card overflow-hidden">
            <div class="px-4 py-2 bg-amber-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-amber-400 uppercase tracking-wider">⛽ Fuel</span>
            </div>
            <div class="p-3">
              <div class="grid grid-cols-2 gap-3 text-center text-[10px]">
                <div>
                  <div class="text-sv-muted">Hydrogen</div>
                  <div class="text-amber-400 font-mono font-medium text-sm">{{ loadout.stats.fuel.hydrogen }}L</div>
                </div>
                <div>
                  <div class="text-sv-muted">Quantum</div>
                  <div class="text-amber-300 font-mono font-medium text-sm">{{ loadout.stats.fuel.quantum }}L</div>
                </div>
              </div>
            </div>
          </div>

          <!-- EMP -->
          <div v-if="loadout.stats.emp?.count" class="card overflow-hidden">
            <div class="px-4 py-2 bg-purple-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-purple-400 uppercase tracking-wider">⚡ EMP</span>
            </div>
            <div class="p-3">
              <div class="text-[10px] text-sv-muted mb-2">{{ loadout.stats.emp.count }} device{{ loadout.stats.emp.count > 1 ? 's' : '' }}</div>
              <table class="w-full text-[10px]">
                <thead>
                  <tr class="text-sv-muted border-b border-sv-border/20">
                    <th class="text-left py-1 font-medium">Name</th>
                    <th class="text-center py-1 font-medium">S</th>
                    <th class="text-right py-1 font-medium">Damage</th>
                    <th class="text-right py-1 font-medium">Radius</th>
                    <th class="text-right py-1 font-medium hidden sm:table-cell">Charge</th>
                    <th class="text-right py-1 font-medium hidden sm:table-cell">CD</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(e, i) in loadout.stats.emp.details" :key="i"
                    class="border-b border-sv-border/10 hover:bg-sv-panel-light/20">
                    <td class="py-1 text-sv-text-bright truncate max-w-[100px]">{{ e.name }}</td>
                    <td class="py-1 text-center text-sv-muted">{{ e.size }}</td>
                    <td class="py-1 text-right text-purple-400 font-mono">{{ fmt(e.damage) }}</td>
                    <td class="py-1 text-right text-purple-300 font-mono">{{ fmt(e.radius, 0) }}m</td>
                    <td class="py-1 text-right text-sv-muted font-mono hidden sm:table-cell">{{ e.charge_time ? fmt(e.charge_time, 1) + 's' : '—' }}</td>
                    <td class="py-1 text-right text-sv-muted font-mono hidden sm:table-cell">{{ e.cooldown ? fmt(e.cooldown, 1) + 's' : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Quantum Interdiction (QED) -->
          <div v-if="loadout.stats.quantum_interdiction?.count" class="card overflow-hidden">
            <div class="px-4 py-2 bg-purple-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-purple-400 uppercase tracking-wider">🔒 Quantum Interdiction</span>
            </div>
            <div class="p-3">
              <div class="text-[10px] text-sv-muted mb-2">{{ loadout.stats.quantum_interdiction.count }} device{{ loadout.stats.quantum_interdiction.count > 1 ? 's' : '' }}</div>
              <table class="w-full text-[10px]">
                <thead>
                  <tr class="text-sv-muted border-b border-sv-border/20">
                    <th class="text-left py-1 font-medium">Name</th>
                    <th class="text-center py-1 font-medium">S</th>
                    <th class="text-right py-1 font-medium">Jammer</th>
                    <th class="text-right py-1 font-medium">Snare</th>
                    <th class="text-right py-1 font-medium hidden sm:table-cell">Charge</th>
                    <th class="text-right py-1 font-medium hidden sm:table-cell">CD</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(q, i) in loadout.stats.quantum_interdiction.details" :key="i"
                    class="border-b border-sv-border/10 hover:bg-sv-panel-light/20">
                    <td class="py-1 text-sv-text-bright truncate max-w-[100px]">{{ q.name }}</td>
                    <td class="py-1 text-center text-sv-muted">{{ q.size }}</td>
                    <td class="py-1 text-right text-purple-400 font-mono">{{ q.jammer_range ? fmt(q.jammer_range, 0) + 'm' : '—' }}</td>
                    <td class="py-1 text-right text-purple-300 font-mono">{{ q.snare_radius ? fmt(q.snare_radius, 0) + 'm' : '—' }}</td>
                    <td class="py-1 text-right text-sv-muted font-mono hidden sm:table-cell">{{ q.charge_time ? fmt(q.charge_time, 1) + 's' : '—' }}</td>
                    <td class="py-1 text-right text-sv-muted font-mono hidden sm:table-cell">{{ q.cooldown ? fmt(q.cooldown, 1) + 's' : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Modules -->
          <div v-if="loadout.modules?.length" class="card overflow-hidden">
            <div class="px-4 py-2 bg-indigo-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">🧩 Modules</span>
            </div>
            <div class="p-3 space-y-1">
              <div v-for="(mod, i) in loadout.modules" :key="i"
                class="flex items-center justify-between text-[10px] px-1 py-0.5">
                <span class="text-sv-text-bright">{{ mod.module_name || mod.name || '—' }}</span>
                <span class="text-sv-muted font-mono">{{ mod.module_type || mod.type || '' }}</span>
              </div>
            </div>
          </div>

          <!-- Paints -->
          <div v-if="loadout.paints?.length" class="card overflow-hidden">
            <div class="px-4 py-2 bg-pink-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-pink-400 uppercase tracking-wider">🎨 Paints</span>
            </div>
            <div class="p-3 space-y-1">
              <div v-for="(paint, i) in loadout.paints" :key="i"
                class="flex items-center justify-between text-[10px] px-1 py-0.5">
                <span class="text-sv-text-bright">{{ paint.paint_name || paint.paint_class_name || '—' }}</span>
              </div>
              <div v-if="!loadout.paints.length" class="text-[10px] text-sv-muted text-center py-2">No paints available</div>
            </div>
          </div>

        </div>
      </div>

      <!-- ═══ Empty State ═══ -->
      <div v-else class="card p-16 text-center">
        <div class="text-5xl mb-4 opacity-30">🎯</div>
        <h2 class="text-sv-text-bright font-semibold text-lg mb-2">Loadout Manager</h2>
        <p class="text-sv-muted text-sm max-w-md mx-auto">
          Select a ship above to view and modify its loadout.<br/>
          Swap components and see real-time stat updates.
        </p>
      </div>
    </LoadingState>

    <!-- ═══ Component Swap Modal ═══ -->
    <Teleport to="body">
      <div v-if="swapTarget" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="cancelSwap">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
        <div class="relative bg-sv-panel border border-sv-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
          <!-- Modal header -->
          <div class="flex items-center justify-between p-4 border-b border-sv-border/40">
            <div>
              <h3 class="text-sm font-bold text-sv-text-bright">Swap Component</h3>
              <div class="text-[10px] text-sv-muted mt-0.5">
                Port: {{ portLabel(swapTarget) }}
                <span v-if="swapTargetType" class="ml-1 text-sv-accent">({{ swapTargetType }})</span>
                <span v-if="swapTargetMinSize || swapTargetMaxSize" class="ml-1 text-sv-accent">
                  S{{ swapTargetMinSize }}<template v-if="swapTargetMinSize !== swapTargetMaxSize">–S{{ swapTargetMaxSize }}</template>
                </span>
              </div>
              <div v-if="swapCurrentComponent" class="text-[10px] text-sv-muted mt-0.5">
                Current: <span class="text-sv-text">{{ swapCurrentComponent.name || swapCurrentComponent.component_name || '—' }}</span>
              </div>
            </div>
            <button @click="cancelSwap" class="p-1 rounded hover:bg-sv-border/30 text-sv-muted hover:text-sv-text transition">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <!-- Search -->
          <div class="p-4 border-b border-sv-border/20">
            <input v-model="swapQuery" @input="debouncedSwapSearch(swapQuery)"
              class="input w-full" placeholder="Search components…" autofocus />
          </div>
          <!-- Results -->
          <div class="flex-1 overflow-y-auto">
            <div v-if="swapLoading" class="p-8 text-center text-sv-muted text-sm">Searching…</div>
            <div v-else-if="swapResults.length" class="divide-y divide-sv-border/20">
              <div v-for="c in swapResults" :key="c.uuid" @click="applySwap(c)"
                class="px-4 py-3 hover:bg-sv-accent/5 cursor-pointer transition-colors flex items-center justify-between">
                <div>
                  <div class="text-xs text-sv-text-bright font-medium">{{ c.name }}</div>
                  <div class="text-[10px] text-sv-muted flex gap-2 mt-0.5">
                    <span>S{{ c.size }}</span>
                    <span v-if="c.grade">Grade {{ c.grade }}</span>
                    <span>{{ c.manufacturer_code }}</span>
                  </div>
                </div>
                <div class="text-[10px] font-mono text-right space-y-0.5">
                  <!-- Weapon stats + delta -->
                  <template v-if="c.weapon_dps">
                    <div class="text-red-400">{{ fmt(c.weapon_dps) }} DPS
                      <span v-if="delta(c, 'weapon_dps')" :class="deltaClass(c, 'weapon_dps')"> ({{ delta(c, 'weapon_dps') }})</span>
                    </div>
                  </template>
                  <!-- Shield stats + delta -->
                  <template v-if="c.shield_hp">
                    <div class="text-blue-400">{{ fmt(c.shield_hp) }} HP
                      <span v-if="delta(c, 'shield_hp')" :class="deltaClass(c, 'shield_hp')"> ({{ delta(c, 'shield_hp') }})</span>
                    </div>
                  </template>
                  <!-- Power output + delta -->
                  <template v-if="c.power_output">
                    <div class="text-yellow-400">{{ fmt(c.power_output) }} pwr
                      <span v-if="delta(c, 'power_output')" :class="deltaClass(c, 'power_output')"> ({{ delta(c, 'power_output') }})</span>
                    </div>
                  </template>
                  <!-- Cooling rate + delta -->
                  <template v-if="c.cooling_rate">
                    <div class="text-cyan-400">{{ fmt(c.cooling_rate) }} cool
                      <span v-if="delta(c, 'cooling_rate')" :class="deltaClass(c, 'cooling_rate')"> ({{ delta(c, 'cooling_rate') }})</span>
                    </div>
                  </template>
                  <!-- QD speed + delta -->
                  <template v-if="c.qd_speed">
                    <div class="text-purple-400">{{ fmt(c.qd_speed) }} m/s
                      <span v-if="delta(c, 'qd_speed')" :class="deltaClass(c, 'qd_speed')"> ({{ delta(c, 'qd_speed') }})</span>
                    </div>
                  </template>
                </div>
              </div>
            </div>
            <div v-else-if="swapQuery.length >= 2" class="p-8 text-center text-sv-muted text-sm">No components found</div>
            <div v-else class="p-8 text-center text-sv-muted text-sm">Type at least 2 characters</div>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>
