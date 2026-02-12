<script setup lang="ts">
import LoadingState from '@/components/LoadingState.vue'
import StatBlock from '@/components/StatBlock.vue'
import {
    calculateLoadout,
    getComponents,
    getShip, getShipLoadout,
    getShips,
    type Component, type LoadoutStats,
    type Ship,
} from '@/services/api'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const shipUuid = ref((route.params.uuid as string) || '')

// Ship search
const shipQuery = ref('')
const shipResults = ref<Ship[]>([])
const ship = ref<Ship | null>(null)

// Loadout — hierarchical tree from API
interface LoadoutNode {
  id: number
  port_name: string; port_type: string; component_uuid: string
  component_name: string; component_type: string; size?: number
  component_size?: number; parent_id?: number | null
  children?: LoadoutNode[]
}
const loadout = ref<LoadoutNode[]>([])
const swaps = ref<{ portName: string; componentUuid: string }[]>([])
const stats = ref<LoadoutStats | null>(null)

// Component picker
const editingPort = ref<string | null>(null)
const componentSearch = ref('')
const componentResults = ref<Component[]>([])
const loading = ref(false)
const calculating = ref(false)

// Collapsed state for tree nodes
const collapsedNodes = ref<Set<number>>(new Set())

function toggleNode(nodeId: number) {
  if (collapsedNodes.value.has(nodeId)) collapsedNodes.value.delete(nodeId)
  else collapsedNodes.value.add(nodeId)
}

// ── Erkul-style categories (only player-meaningful) ──
interface CategoryInfo { label: string; icon: string; color: string; order: number; swappable: boolean }
const CATEGORY_MAP: Record<string, CategoryInfo> = {
  'WeaponGun': { label: 'Weapons', icon: '🎯', color: 'red', order: 1, swappable: true },
  'Weapon': { label: 'Weapons', icon: '🎯', color: 'red', order: 1, swappable: true },
  'Gimbal': { label: 'Weapons', icon: '🎯', color: 'red', order: 1, swappable: false },
  'TurretBase': { label: 'Turrets', icon: '🔫', color: 'red', order: 2, swappable: false },
  'Turret': { label: 'Turrets', icon: '🔫', color: 'red', order: 2, swappable: false },
  'MissileLauncher': { label: 'Missiles & Bombs', icon: '🚀', color: 'amber', order: 3, swappable: false },
  'MissileRack': { label: 'Missiles & Bombs', icon: '🚀', color: 'amber', order: 3, swappable: false },
  'WeaponMissile': { label: 'Missiles & Bombs', icon: '🚀', color: 'amber', order: 3, swappable: false },
  'Missile': { label: 'Missiles & Bombs', icon: '🚀', color: 'amber', order: 3, swappable: false },
  'Shield': { label: 'Shields', icon: '🛡️', color: 'blue', order: 4, swappable: true },
  'ShieldGenerator': { label: 'Shields', icon: '🛡️', color: 'blue', order: 4, swappable: true },
  'PowerPlant': { label: 'Power Plants', icon: '⚡', color: 'green', order: 5, swappable: true },
  'Cooler': { label: 'Coolers', icon: '❄️', color: 'cyan', order: 6, swappable: true },
  'QuantumDrive': { label: 'Quantum Drive', icon: '💫', color: 'purple', order: 7, swappable: true },
  'Radar': { label: 'Radar', icon: '📡', color: 'blue', order: 8, swappable: true },
  'EMP': { label: 'EMP', icon: '⚡', color: 'purple', order: 9, swappable: false },
  'MainThruster': { label: 'Thrusters', icon: '🔥', color: 'amber', order: 10, swappable: false },
  'ManneuverThruster': { label: 'Thrusters', icon: '🔥', color: 'amber', order: 10, swappable: false },
  'Thruster': { label: 'Thrusters', icon: '🔥', color: 'amber', order: 10, swappable: false },
  'QuantumInterdictionGenerator': { label: 'QED', icon: '🔒', color: 'purple', order: 11, swappable: false },
  'Countermeasure': { label: 'Countermeasures', icon: '🎇', color: 'amber', order: 12, swappable: false },
}

// Types to HIDE from the loadout (not relevant to player)
const HIDDEN_TYPES = new Set([
  'FuelIntake', 'FuelTank', 'QuantumFuelTank', 'HydrogenFuelTank',
  'LifeSupport', 'FlightController', 'SelfDestruct', 'Transponder',
  'Scanner', 'Ping', 'Armor', 'Light', 'LandingGear', 'Door',
  'Seat', 'Container', 'WeaponRack',
])

function getNodeType(node: LoadoutNode): string {
  return node.component_type || node.port_type || ''
}

function isHiddenNode(node: LoadoutNode): boolean {
  const type = getNodeType(node)
  if (!type) return true
  for (const hidden of HIDDEN_TYPES) {
    if (type.toLowerCase().includes(hidden.toLowerCase())) return true
  }
  if (node.port_type === 'Other' && !CATEGORY_MAP[node.component_type]) return true
  return false
}

function getCategoryInfo(node: LoadoutNode): CategoryInfo | null {
  const type = getNodeType(node)
  // Direct match on component_type first
  if (node.component_type && CATEGORY_MAP[node.component_type]) return CATEGORY_MAP[node.component_type]
  // Then port_type
  if (node.port_type && CATEGORY_MAP[node.port_type]) return CATEGORY_MAP[node.port_type]
  // Fuzzy match
  for (const [key, info] of Object.entries(CATEGORY_MAP)) {
    if (type.toLowerCase().includes(key.toLowerCase())) return info
  }
  const pt = (node.port_type || '').toLowerCase()
  if (pt.includes('weapon') || pt.includes('gun')) return CATEGORY_MAP['WeaponGun']
  if (pt.includes('turret') || pt === 'gimbal') return CATEGORY_MAP['TurretBase']
  if (pt.includes('missile')) return CATEGORY_MAP['MissileLauncher']
  if (pt.includes('shield')) return CATEGORY_MAP['Shield']
  if (pt.includes('power')) return CATEGORY_MAP['PowerPlant']
  if (pt.includes('cool')) return CATEGORY_MAP['Cooler']
  if (pt.includes('quantum') || pt.includes('qd')) return CATEGORY_MAP['QuantumDrive']
  if (pt.includes('thruster')) return CATEGORY_MAP['MainThruster']
  if (pt.includes('radar')) return CATEGORY_MAP['Radar']
  if (pt.includes('countermeasure')) return CATEGORY_MAP['Countermeasure']
  return null
}

function isSwappable(node: LoadoutNode): boolean {
  const info = getCategoryInfo(node)
  return info?.swappable ?? false
}

// Group root nodes by category, filtering out hidden/irrelevant types
const categorizedTree = computed(() => {
  const groups: Map<string, { info: CategoryInfo; nodes: LoadoutNode[] }> = new Map()

  for (const root of loadout.value) {
    if (isHiddenNode(root)) continue
    const info = getCategoryInfo(root)
    if (!info) continue
    const key = info.label
    if (!groups.has(key)) groups.set(key, { info, nodes: [] })
    groups.get(key)!.nodes.push(root)
  }

  return Array.from(groups.entries())
    .sort((a, b) => a[1].info.order - b[1].info.order)
    .map(([key, val]) => ({ key, ...val }))
})

// Count all items (root + children) in a category
function categoryTotal(nodes: LoadoutNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + (n.children?.length || 0), 0)
}

async function searchShips(q: string) {
  if (q.length < 2) { shipResults.value = []; return }
  const res = await getShips({ search: q, limit: '8' })
  shipResults.value = res.data
}

async function selectShip(s: Ship) {
  ship.value = s
  shipUuid.value = s.class_name || s.uuid
  shipQuery.value = s.name
  shipResults.value = []
  await loadShipData()
}

async function loadShipData() {
  if (!shipUuid.value) return
  loading.value = true
  try {
    const [shipRes, loadoutRes] = await Promise.all([
      getShip(shipUuid.value).catch(() => null),
      getShipLoadout(shipUuid.value).catch(() => ({ data: [] })),
    ])
    if (shipRes) {
      ship.value = shipRes.data
      shipQuery.value = shipRes.data.name
    }
    loadout.value = loadoutRes.data || []
    swaps.value = []
    collapsedNodes.value = new Set()
    await recalculate()
  } finally {
    loading.value = false
  }
}

async function recalculate() {
  if (!shipUuid.value) return
  calculating.value = true
  try {
    const res = await calculateLoadout(shipUuid.value, swaps.value)
    stats.value = res.data
  } catch {
    stats.value = null
  } finally {
    calculating.value = false
  }
}

async function searchComponents(q: string) {
  if (q.length < 2) { componentResults.value = []; return }
  const portItem = findPortInTree(editingPort.value!)
  const params: Record<string, string> = { search: q, limit: '10' }
  if (portItem?.component_type) params.type = portItem.component_type
  const portSize = portItem?.component_size ?? portItem?.size
  if (portSize != null) params.size = String(portSize)
  const res = await getComponents(params)
  componentResults.value = res.data
}

function findPortInTree(portName: string): LoadoutNode | null {
  for (const root of loadout.value) {
    if (root.port_name === portName) return root
    if (root.children) {
      const child = root.children.find(c => c.port_name === portName)
      if (child) return child
    }
  }
  return null
}

function swapComponent(portName: string, comp: Component) {
  const existing = swaps.value.findIndex(s => s.portName === portName)
  if (existing >= 0) swaps.value[existing].componentUuid = comp.uuid
  else swaps.value.push({ portName, componentUuid: comp.uuid })

  // Update in tree
  for (const root of loadout.value) {
    if (root.port_name === portName) {
      root.component_uuid = comp.uuid
      root.component_name = comp.name
      break
    }
    if (root.children) {
      const child = root.children.find(c => c.port_name === portName)
      if (child) {
        child.component_uuid = comp.uuid
        child.component_name = comp.name
        break
      }
    }
  }

  editingPort.value = null
  componentSearch.value = ''
  componentResults.value = []
  recalculate()
}

function resetSwaps() {
  swaps.value = []
  loadShipData()
}

const swapCount = computed(() => swaps.value.length)

function fmt(v: any, digits = 1) {
  if (v == null || v === 0) return '—'
  if (typeof v === 'number') return v.toLocaleString('en-US', { maximumFractionDigits: digits })
  return v
}

function balanceIcon(v: number) {
  return v >= 0 ? '✓' : '⚠'
}

function colorClass(color: string, type: 'text' | 'bg' | 'border') {
  const map: Record<string, Record<string, string>> = {
    'red': { text: 'text-red-400', bg: 'bg-red-500/5', border: 'border-red-500/20' },
    'amber': { text: 'text-amber-400', bg: 'bg-amber-500/5', border: 'border-amber-500/20' },
    'blue': { text: 'text-blue-400', bg: 'bg-blue-500/5', border: 'border-blue-500/20' },
    'green': { text: 'text-green-400', bg: 'bg-green-500/5', border: 'border-green-500/20' },
    'cyan': { text: 'text-cyan-400', bg: 'bg-cyan-500/5', border: 'border-cyan-500/20' },
    'purple': { text: 'text-purple-400', bg: 'bg-purple-500/5', border: 'border-purple-500/20' },
  }
  return map[color]?.[type] || (type === 'text' ? 'text-sv-muted' : type === 'bg' ? 'bg-sv-darker/30' : 'border-sv-border/20')
}

onMounted(() => { if (shipUuid.value) loadShipData() })
watch(() => route.params.uuid, (newUuid) => {
  if (newUuid && newUuid !== shipUuid.value) {
    shipUuid.value = newUuid as string
    loadShipData()
  }
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="section-title">🎯 Loadout Manager</h1>
      <div v-if="ship" class="flex items-center gap-2">
        <span v-if="swapCount > 0" class="badge-amber text-[10px]">{{ swapCount }} change(s)</span>
        <button v-if="swapCount > 0" @click="resetSwaps" class="btn-ghost text-[10px] border border-sv-border">↺ Reset</button>
      </div>
    </div>

    <!-- Ship picker card -->
    <div class="card p-4 relative">
      <div class="flex items-center gap-3">
        <div class="text-2xl">🚀</div>
        <div class="flex-1">
          <label class="text-[10px] text-sv-muted uppercase tracking-wider font-semibold block mb-1">Ship</label>
          <input
            v-model="shipQuery" @input="searchShips(shipQuery)"
            class="input w-full text-sm" placeholder="Search a ship…"
          />
        </div>
        <div v-if="ship" class="text-right hidden sm:block">
          <div class="text-xs text-sv-muted">{{ (ship as any).manufacturer_name || ship.manufacturer_code }}</div>
          <div class="text-[10px] text-sv-muted/60">{{ ship.class_name }}</div>
        </div>
      </div>
      <div v-if="shipResults.length" class="absolute z-50 left-4 right-4 mt-2 bg-sv-panel border border-sv-border rounded-lg shadow-xl max-h-56 overflow-y-auto">
        <div v-for="s in shipResults" :key="s.uuid" @click="selectShip(s)"
          class="px-3 py-2 hover:bg-sv-accent/10 cursor-pointer text-xs flex items-center justify-between border-b border-sv-border/20 last:border-0">
          <div>
            <span class="text-sv-text-bright font-medium">{{ s.name }}</span>
            <span class="text-sv-muted ml-2 text-[10px]">{{ (s as any).manufacturer_name || s.manufacturer_code }}</span>
          </div>
          <span v-if="s.ship_matrix_id" class="badge-cyan text-[9px]">✓</span>
        </div>
      </div>
    </div>

    <!-- Ship quick stats bar -->
    <div v-if="ship && !loading" class="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
      <div class="card p-2 text-center">
        <div class="text-[9px] text-sv-muted uppercase">HP</div>
        <div class="text-xs font-semibold text-sv-text-bright">{{ fmt(ship.total_hp, 0) }}</div>
      </div>
      <div class="card p-2 text-center">
        <div class="text-[9px] text-sv-muted uppercase">Shield</div>
        <div class="text-xs font-semibold text-blue-400">{{ fmt(ship.shield_hp, 0) }}</div>
      </div>
      <div class="card p-2 text-center">
        <div class="text-[9px] text-sv-muted uppercase">SCM</div>
        <div class="text-xs font-semibold text-sv-text-bright">{{ fmt(ship.scm_speed, 0) }} m/s</div>
      </div>
      <div class="card p-2 text-center">
        <div class="text-[9px] text-sv-muted uppercase">Max</div>
        <div class="text-xs font-semibold text-sv-text-bright">{{ fmt(ship.max_speed, 0) }} m/s</div>
      </div>
      <div class="card p-2 text-center">
        <div class="text-[9px] text-sv-muted uppercase">Cargo</div>
        <div class="text-xs font-semibold text-amber-400">{{ fmt(ship.cargo_capacity, 0) }} SCU</div>
      </div>
      <div class="card p-2 text-center">
        <div class="text-[9px] text-sv-muted uppercase">Mass</div>
        <div class="text-xs font-semibold text-sv-text-bright">{{ fmt(Math.round(ship.mass), 0) }} kg</div>
      </div>
    </div>

    <LoadingState :loading="loading">
      <div v-if="ship" class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- LEFT: Tree view by category (2/3) -->
        <div class="lg:col-span-2 space-y-3">
          <div v-if="loadout.length === 0" class="card p-10 text-center text-sv-muted text-sm">
            No components in this ship's loadout
          </div>

          <div v-for="cat in categorizedTree" :key="cat.key" class="card overflow-hidden">
            <!-- Category header -->
            <div class="px-3 py-2 border-b border-sv-border/30 flex items-center gap-2"
              :class="colorClass(cat.info.color, 'bg')">
              <span class="text-sm">{{ cat.info.icon }}</span>
              <span class="text-[11px] font-semibold uppercase tracking-wider" :class="colorClass(cat.info.color, 'text')">
                {{ cat.info.label }}
              </span>
              <span class="text-[10px] text-sv-muted ml-auto">{{ categoryTotal(cat.nodes) }} item(s)</span>
            </div>

            <!-- Tree nodes -->
            <div class="divide-y divide-sv-border/10">
              <template v-for="root in cat.nodes" :key="root.port_name">
                <!-- Root node -->
                <div class="relative">
                  <div class="px-3 py-2 flex items-center gap-2 hover:bg-sv-panel-light/20 transition-colors group">
                    <!-- Expand/collapse toggle -->
                    <button v-if="root.children && root.children.length > 0"
                      @click="toggleNode(root.id)"
                      class="w-4 h-4 flex items-center justify-center text-sv-muted hover:text-sv-text text-[10px] shrink-0">
                      {{ collapsedNodes.has(root.id) ? '▶' : '▼' }}
                    </button>
                    <div v-else class="w-4 shrink-0"></div>

                    <!-- Size badge -->
                    <div class="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
                      :class="`${colorClass(cat.info.color, 'bg')} ${colorClass(cat.info.color, 'text')}`"
                      style="background-color: rgba(var(--cat-color), 0.15);">
                      S{{ root.component_size || root.size || '?' }}
                    </div>

                    <!-- Component info -->
                    <div class="flex-1 min-w-0">
                      <div class="text-xs font-medium text-sv-text-bright truncate">
                        {{ root.component_name || '— empty —' }}
                      </div>
                      <div class="text-[10px] text-sv-muted truncate">{{ root.port_name }}</div>
                    </div>

                    <!-- Children count badge -->
                    <span v-if="root.children && root.children.length > 0"
                      class="text-[9px] px-1.5 py-0.5 rounded-full bg-sv-darker text-sv-muted shrink-0">
                      {{ root.children.length }}×
                    </span>

                    <!-- Type badge -->
                    <span class="text-[9px] px-1.5 py-0.5 rounded bg-sv-darker text-sv-muted shrink-0 hidden sm:inline">
                      {{ root.component_type || root.port_type }}
                    </span>

                    <!-- Swap button (only for swappable) -->
                    <button v-if="isSwappable(root)"
                      @click="editingPort = editingPort === root.port_name ? null : root.port_name; componentSearch = ''; componentResults = []"
                      class="text-[10px] px-2 py-0.5 rounded-md border transition-all shrink-0"
                      :class="editingPort === root.port_name
                        ? 'border-red-500/50 text-red-400 bg-red-500/10'
                        : 'border-sv-border/50 text-sv-muted hover:text-sv-accent hover:border-sv-accent/50 opacity-0 group-hover:opacity-100'"
                    >
                      {{ editingPort === root.port_name ? '✕' : '↔' }}
                    </button>
                    <!-- Lock icon for non-swappable -->
                    <span v-else class="text-[10px] text-sv-muted/30 shrink-0" title="Fixed component">🔒</span>
                  </div>

                  <!-- Component picker for root -->
                  <div v-if="editingPort === root.port_name && isSwappable(root)"
                    class="mx-3 mb-2 bg-sv-darker/50 border border-sv-border/30 rounded-lg p-3">
                    <input
                      v-model="componentSearch"
                      @input="searchComponents(componentSearch)"
                      class="input w-full text-xs mb-2"
                      placeholder="Search a compatible component…"
                      autofocus
                    />
                    <div class="max-h-40 overflow-y-auto space-y-0.5">
                      <div v-for="c in componentResults" :key="c.uuid" @click="swapComponent(root.port_name, c)"
                        class="px-2.5 py-1.5 hover:bg-sv-accent/10 rounded-md cursor-pointer transition-colors">
                        <div class="text-xs text-sv-text-bright font-medium">{{ c.name }}</div>
                        <div class="text-[10px] text-sv-muted flex gap-2">
                          <span>S{{ c.size }}</span>
                          <span>{{ c.type }}</span>
                          <span v-if="c.weapon_dps" class="text-red-400">{{ Math.round(c.weapon_dps) }} DPS</span>
                          <span v-if="c.shield_hp" class="text-blue-400">{{ c.shield_hp }} HP</span>
                        </div>
                      </div>
                      <div v-if="componentSearch.length >= 2 && componentResults.length === 0"
                        class="text-sv-muted text-center py-2 text-[11px]">No component found</div>
                      <div v-if="componentSearch.length < 2"
                        class="text-sv-muted text-center py-2 text-[11px]">Type at least 2 characters…</div>
                    </div>
                  </div>

                  <!-- Children (indented) -->
                  <div v-if="root.children && root.children.length > 0 && !collapsedNodes.has(root.id)"
                    class="border-t border-sv-border/10">
                    <div v-for="child in root.children" :key="child.port_name"
                      class="flex items-center gap-2 hover:bg-sv-panel-light/10 transition-colors group relative"
                      style="padding: 6px 12px 6px 44px;">
                      <!-- Tree connector line -->
                      <div class="absolute left-6 top-0 bottom-0 w-px bg-sv-border/20"></div>
                      <div class="absolute left-6 top-1/2 w-3 h-px bg-sv-border/20"></div>

                      <!-- Size badge (smaller) -->
                      <div class="w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold shrink-0 bg-sv-darker/50"
                        :class="colorClass(cat.info.color, 'text')">
                        S{{ child.component_size || child.size || '?' }}
                      </div>

                      <!-- Component info -->
                      <div class="flex-1 min-w-0">
                        <div class="text-[11px] text-sv-text truncate">
                          {{ child.component_name || '— empty —' }}
                        </div>
                        <div class="text-[9px] text-sv-muted/60 truncate">{{ child.port_name }}</div>
                      </div>

                      <!-- Type badge -->
                      <span class="text-[9px] px-1 py-0.5 rounded bg-sv-darker/30 text-sv-muted/60 shrink-0 hidden sm:inline">
                        {{ child.component_type || child.port_type }}
                      </span>

                      <!-- Swap button (only for swappable) -->
                      <button v-if="isSwappable(child)"
                        @click="editingPort = editingPort === child.port_name ? null : child.port_name; componentSearch = ''; componentResults = []"
                        class="text-[10px] px-2 py-0.5 rounded-md border transition-all shrink-0"
                        :class="editingPort === child.port_name
                          ? 'border-red-500/50 text-red-400 bg-red-500/10'
                          : 'border-sv-border/50 text-sv-muted hover:text-sv-accent hover:border-sv-accent/50 opacity-0 group-hover:opacity-100'"
                      >
                        {{ editingPort === child.port_name ? '✕' : '↔' }}
                      </button>
                      <span v-else class="text-[10px] text-sv-muted/30 shrink-0" title="Fixed component">🔒</span>
                    </div>

                    <!-- Component picker for child (if editing) -->
                    <template v-for="child in root.children" :key="'picker-' + child.port_name">
                      <div v-if="editingPort === child.port_name && isSwappable(child)"
                        class="mx-3 mb-2 bg-sv-darker/50 border border-sv-border/30 rounded-lg p-3" style="margin-left: 44px;">
                        <input
                          v-model="componentSearch"
                          @input="searchComponents(componentSearch)"
                          class="input w-full text-xs mb-2"
                          placeholder="Search a compatible component…"
                          autofocus
                        />
                        <div class="max-h-40 overflow-y-auto space-y-0.5">
                          <div v-for="c in componentResults" :key="c.uuid" @click="swapComponent(child.port_name, c)"
                            class="px-2.5 py-1.5 hover:bg-sv-accent/10 rounded-md cursor-pointer transition-colors">
                            <div class="text-xs text-sv-text-bright font-medium">{{ c.name }}</div>
                            <div class="text-[10px] text-sv-muted flex gap-2">
                              <span>S{{ c.size }}</span>
                              <span>{{ c.type }}</span>
                              <span v-if="c.weapon_dps" class="text-red-400">{{ Math.round(c.weapon_dps) }} DPS</span>
                              <span v-if="c.shield_hp" class="text-blue-400">{{ c.shield_hp }} HP</span>
                            </div>
                          </div>
                          <div v-if="componentSearch.length >= 2 && componentResults.length === 0"
                            class="text-sv-muted text-center py-2 text-[11px]">No component found</div>
                          <div v-if="componentSearch.length < 2"
                            class="text-sv-muted text-center py-2 text-[11px]">Type at least 2 characters…</div>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- RIGHT: Stats panel (1/3) -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-sv-text-bright">📊 Statistics</h2>
            <div v-if="calculating" class="text-[10px] text-sv-accent animate-pulse">Calculating…</div>
          </div>

          <template v-if="stats">
            <!-- Weapons -->
            <div class="card overflow-hidden">
              <div class="px-3 py-1.5 bg-red-500/5 border-b border-sv-border/30">
                <h3 class="text-[10px] text-red-400 uppercase tracking-wider font-semibold">🎯 Weapons</h3>
              </div>
              <div class="p-3 space-y-2">
                <div class="flex justify-between items-baseline">
                  <span class="text-[10px] text-sv-muted">Count</span>
                  <span class="text-xs text-sv-text-bright font-medium">{{ stats.stats.weapons.count }}</span>
                </div>
                <div class="flex justify-between items-baseline">
                  <span class="text-[10px] text-sv-muted">Total DPS</span>
                  <span class="text-xs text-red-400 font-bold">{{ fmt(stats.stats.weapons.total_dps) }}</span>
                </div>
                <div class="flex justify-between items-baseline">
                  <span class="text-[10px] text-sv-muted">Burst DPS</span>
                  <span class="text-xs text-amber-400 font-medium">{{ fmt(stats.stats.weapons.total_burst_dps) }}</span>
                </div>
                <div class="flex justify-between items-baseline">
                  <span class="text-[10px] text-sv-muted">Sustained DPS</span>
                  <span class="text-xs text-amber-400 font-medium">{{ fmt(stats.stats.weapons.total_sustained_dps) }}</span>
                </div>
              </div>
            </div>

            <!-- Shields -->
            <div class="card overflow-hidden">
              <div class="px-3 py-1.5 bg-blue-500/5 border-b border-sv-border/30">
                <h3 class="text-[10px] text-blue-400 uppercase tracking-wider font-semibold">🛡️ Shields</h3>
              </div>
              <div class="p-3 space-y-2">
                <div class="flex justify-between items-baseline">
                  <span class="text-[10px] text-sv-muted">Total HP</span>
                  <span class="text-xs text-blue-400 font-bold">{{ fmt(stats.stats.shields.total_hp, 0) }}</span>
                </div>
                <div class="flex justify-between items-baseline">
                  <span class="text-[10px] text-sv-muted">Regeneration</span>
                  <span class="text-xs text-blue-400 font-medium">{{ fmt(stats.stats.shields.total_regen) }} /s</span>
                </div>
              </div>
            </div>

            <!-- Missiles -->
            <div class="card overflow-hidden">
              <div class="px-3 py-1.5 bg-amber-500/5 border-b border-sv-border/30">
                <h3 class="text-[10px] text-amber-400 uppercase tracking-wider font-semibold">🚀 Missiles</h3>
              </div>
              <div class="p-3 space-y-2">
                <div class="flex justify-between items-baseline">
                  <span class="text-[10px] text-sv-muted">Count</span>
                  <span class="text-xs text-sv-text-bright font-medium">{{ stats.stats.missiles.count }}</span>
                </div>
                <div class="flex justify-between items-baseline">
                  <span class="text-[10px] text-sv-muted">Total Damage</span>
                  <span class="text-xs text-red-400 font-bold">{{ fmt(stats.stats.missiles.total_damage, 0) }}</span>
                </div>
              </div>
            </div>

            <!-- Power -->
            <div class="card overflow-hidden">
              <div class="px-3 py-1.5 bg-green-500/5 border-b border-sv-border/30">
                <h3 class="text-[10px] text-green-400 uppercase tracking-wider font-semibold">⚡ Power</h3>
              </div>
              <div class="p-3 space-y-2">
                <div class="flex justify-between items-baseline">
                  <span class="text-[10px] text-sv-muted">Output</span>
                  <span class="text-xs text-green-400 font-medium">{{ fmt(stats.stats.power.total_output) }}</span>
                </div>
                <div class="flex justify-between items-baseline">
                  <span class="text-[10px] text-sv-muted">Draw</span>
                  <span class="text-xs text-sv-text-bright font-medium">{{ fmt(stats.stats.power.total_draw) }}</span>
                </div>
                <div class="pt-1 border-t border-sv-border/20 flex justify-between items-baseline">
                  <span class="text-[10px] text-sv-muted">Balance</span>
                  <span class="text-xs font-bold" :class="stats.stats.power.balance >= 0 ? 'text-emerald-400' : 'text-red-400'">
                    {{ balanceIcon(stats.stats.power.balance) }} {{ stats.stats.power.balance >= 0 ? '+' : '' }}{{ fmt(stats.stats.power.balance) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Thermal -->
            <div class="card overflow-hidden">
              <div class="px-3 py-1.5 bg-cyan-500/5 border-b border-sv-border/30">
                <h3 class="text-[10px] text-cyan-400 uppercase tracking-wider font-semibold">❄️ Thermal</h3>
              </div>
              <div class="p-3 space-y-2">
                <div class="flex justify-between items-baseline">
                  <span class="text-[10px] text-sv-muted">Cooling</span>
                  <span class="text-xs text-cyan-400 font-medium">{{ fmt(stats.stats.thermal.total_cooling_rate) }}</span>
                </div>
                <div class="flex justify-between items-baseline">
                  <span class="text-[10px] text-sv-muted">Heat Generated</span>
                  <span class="text-xs text-sv-text-bright font-medium">{{ fmt(stats.stats.thermal.total_heat_generation) }}</span>
                </div>
                <div class="pt-1 border-t border-sv-border/20 flex justify-between items-baseline">
                  <span class="text-[10px] text-sv-muted">Balance</span>
                  <span class="text-xs font-bold" :class="stats.stats.thermal.balance >= 0 ? 'text-emerald-400' : 'text-red-400'">
                    {{ balanceIcon(stats.stats.thermal.balance) }} {{ stats.stats.thermal.balance >= 0 ? '+' : '' }}{{ fmt(stats.stats.thermal.balance) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Survivability summary -->
            <div class="card overflow-hidden">
              <div class="px-3 py-1.5 bg-emerald-500/5 border-b border-sv-border/30">
                <h3 class="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold">💚 Survivability</h3>
              </div>
              <div class="p-3 grid grid-cols-2 gap-1.5">
                <StatBlock label="Hull HP" :value="fmt(ship?.total_hp, 0)" color="green" />
                <StatBlock label="Shield" :value="fmt(stats.stats.shields.total_hp, 0)" color="blue" />
              </div>
            </div>
          </template>

          <div v-else-if="!calculating" class="card p-6 text-center text-sv-muted text-xs">
            Statistics will appear once the loadout is loaded
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="card p-12 text-center">
        <div class="text-4xl mb-3 opacity-40">🎯</div>
        <h2 class="text-sv-text-bright font-semibold mb-1">Loadout Manager</h2>
        <p class="text-sv-muted text-sm">Select a ship to manage its loadout,<br/>compare components and analyze statistics.</p>
      </div>
    </LoadingState>
  </div>
</template>
