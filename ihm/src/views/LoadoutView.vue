<script setup lang="ts">
import LoadingState from '@/components/LoadingState.vue'
import { calculateLoadout, getComponents, getShips, type Component, type Hardpoint, type HardpointComponent, type HardpointSubItem, type LoadoutStats, type Ship } from '@/services/api'
import { HARDPOINT_CATEGORIES, MOUNT_TYPE_LABELS } from '@/utils/constants'
import { debounce, fmt, pct, useClickOutside } from '@/utils/formatters'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// ── Core state ──
const shipQuery = ref('')
const shipResults = ref<Ship[]>([])
const selectedShip = ref<Ship | null>(null)
const loadout = ref<LoadoutStats | null>(null)
const loading = ref(false)
const error = ref('')
const swaps = ref<{ portId: number; componentUuid: string }[]>([])
const mountOverrides = ref<Record<number, string>>({})

// ── Inline selector state ──
const selectorTarget = ref<{
  portId: number; portName: string; type: string; maxSize: number
  current: Record<string, unknown> | null; hpPortId: number
} | null>(null)
const selectorQuery = ref('')
const selectorResults = ref<Component[]>([])
const selectorLoading = ref(false)
const selectorInputRef = ref<HTMLInputElement | null>(null)
const selectorSort = ref<{ col: string; asc: boolean }>({ col: '', asc: false })

// Click-outside for ship search
const shipSearchRef = ref<HTMLElement | null>(null)
useClickOutside(shipSearchRef, () => { shipResults.value = [] })

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
  mountOverrides.value = {}
  closeSelector()
  router.replace({ params: { uuid: ship.uuid } })
  fetchLoadout(ship.uuid)
}

async function fetchLoadout(uuid: string) {
  loading.value = true; error.value = ''
  try {
    loadout.value = (await calculateLoadout(uuid, swaps.value)).data
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Erreur loadout'
  } finally { loading.value = false }
}

// ── Grouped hardpoints ──
const groupedHardpoints = computed(() => {
  if (!loadout.value?.hardpoints) return []
  const groups: Record<string, { meta: (typeof HARDPOINT_CATEGORIES)[string]; items: Hardpoint[] }> = {}
  for (const hp of loadout.value.hardpoints) {
    const meta = HARDPOINT_CATEGORIES[hp.category]
    if (!meta) continue
    if (!groups[hp.category]) groups[hp.category] = { meta, items: [] }
    groups[hp.category].items.push(hp)
  }
  return Object.entries(groups)
    .sort(([, a], [, b]) => a.meta.order - b.meta.order)
    .map(([key, val]) => ({
      category: key, ...val.meta,
      items: val.items,
      totalCount: val.items.reduce((n, hp) => n + Math.max(hp.items.length, hp.component ? 1 : 0), 0),
    }))
})

// ── 3-column distribution (like screenshots) ──
const columns = computed(() => {
  const col1: string[] = ['Turrets', 'Weapons', 'Missiles']
  const col2: string[] = ['Shields', 'Power Plants']
  const col3: string[] = ['Coolers', 'Quantum Drive', 'Radar', 'Countermeasures', 'EMP', 'QED']
  const leftGroups = groupedHardpoints.value.filter(g => col1.includes(g.category))
  const midGroups = groupedHardpoints.value.filter(g => col2.includes(g.category))
  const rightGroups = groupedHardpoints.value.filter(g => col3.includes(g.category))
  // Remaining categories go to right column
  const assigned = new Set([...col1, ...col2, ...col3])
  const extra = groupedHardpoints.value.filter(g => !assigned.has(g.category))
  return { left: leftGroups, mid: midGroups, right: [...rightGroups, ...extra] }
})

// ── Mount type logic ──
function getMountType(hp: Hardpoint): string | null {
  return mountOverrides.value[hp.port_id] || hp.mount_type
}
function cycleMountType(hp: Hardpoint) {
  mountOverrides.value[hp.port_id] = getMountType(hp) === 'Gimbal' ? 'Fixed' : 'Gimbal'
}
function isMountOverridden(hp: Hardpoint): boolean {
  return !!mountOverrides.value[hp.port_id] && mountOverrides.value[hp.port_id] !== hp.mount_type
}
function resetMount(hp: Hardpoint) { delete mountOverrides.value[hp.port_id] }

// ── Selector ──
function openSelector(portId: number, portName: string, type: string, maxSize: number, current: Record<string, unknown> | null, hpPortId: number) {
  selectorTarget.value = { portId, portName, type, maxSize, current, hpPortId }
  selectorQuery.value = ''
  selectorResults.value = []
  selectorSort.value = { col: '', asc: false }
  loadSelectorResults('')
  nextTick(() => { selectorInputRef.value?.focus() })
}
function closeSelector() {
  selectorTarget.value = null; selectorQuery.value = ''; selectorResults.value = []
}
async function loadSelectorResults(q: string) {
  if (!selectorTarget.value) return
  selectorLoading.value = true
  try {
    const params: Record<string, string> = { limit: '50' }
    if (selectorTarget.value.type) params.type = selectorTarget.value.type
    if (selectorTarget.value.maxSize > 0) params.max_size = String(selectorTarget.value.maxSize)
    if (q.length >= 1) params.search = q
    const res = await getComponents(params)
    selectorResults.value = res.data
  } finally { selectorLoading.value = false }
}
const debouncedSelectorSearch = debounce((q: string) => loadSelectorResults(q), 250)

// ── Sorted selector results ──
const sortedSelectorResults = computed(() => {
  const list = [...selectorResults.value]
  const { col, asc } = selectorSort.value
  if (!col) return list
  list.sort((a, b) => {
    const va = (a as Record<string, unknown>)[col]
    const vb = (b as Record<string, unknown>)[col]
    const na = typeof va === 'number' ? va : parseFloat(String(va)) || 0
    const nb = typeof vb === 'number' ? vb : parseFloat(String(vb)) || 0
    return asc ? na - nb : nb - na
  })
  return list
})

function toggleSort(col: string) {
  if (selectorSort.value.col === col) selectorSort.value.asc = !selectorSort.value.asc
  else selectorSort.value = { col, asc: false }
}
function sortArrow(col: string): string {
  if (selectorSort.value.col !== col) return ''
  return selectorSort.value.asc ? ' ↑' : ' ↓'
}

// ── Swap ──
async function applySwap(component: Component) {
  if (!selectorTarget.value || !selectedShip.value) return
  const pid = selectorTarget.value.portId
  const existing = swaps.value.findIndex(s => s.portId === pid)
  if (existing !== -1) swaps.value[existing].componentUuid = component.uuid
  else swaps.value.push({ portId: pid, componentUuid: component.uuid })
  closeSelector()
  await fetchLoadout(selectedShip.value.uuid)
}
function removeSwap(portId: number) {
  swaps.value = swaps.value.filter(s => s.portId !== portId)
  if (selectedShip.value) fetchLoadout(selectedShip.value.uuid)
}
function leaveEmpty() {
  closeSelector()
}
function resetCategory(category: string) {
  if (!loadout.value || !selectedShip.value) return
  const catHps = loadout.value.hardpoints.filter(h => h.category === category)
  const catPortIds = new Set<number>()
  for (const hp of catHps) {
    catPortIds.add(hp.port_id)
    if (hp.component) catPortIds.add(hp.component.port_id)
    for (const item of hp.items) {
      catPortIds.add(item.port_id)
      if (item.sub_items) for (const sub of item.sub_items) catPortIds.add(sub.port_id)
    }
  }
  const hadSwaps = swaps.value.some(s => catPortIds.has(s.portId))
  const hadMounts = catHps.some(hp => mountOverrides.value[hp.port_id])
  swaps.value = swaps.value.filter(s => !catPortIds.has(s.portId))
  for (const hp of catHps) delete mountOverrides.value[hp.port_id]
  if ((hadSwaps || hadMounts) && selectedShip.value) fetchLoadout(selectedShip.value.uuid)
}
async function resetAll() {
  if (!selectedShip.value) return
  swaps.value = []; mountOverrides.value = {}; closeSelector()
  await fetchLoadout(selectedShip.value.uuid)
}

// ── Helpers ──
function swapTypeForHp(hp: Hardpoint, comp: HardpointComponent | null): string {
  if (comp?.type) return comp.type
  const map: Record<string, string> = {
    'Weapons': 'WeaponGun', 'Turrets': 'WeaponGun', 'Missiles': 'Missile', 'Shields': 'Shield',
    'Power Plants': 'PowerPlant', 'Coolers': 'Cooler', 'Quantum Drive': 'QuantumDrive',
    'Radar': 'Radar', 'Countermeasures': 'Countermeasure', 'EMP': 'EMP', 'QED': 'QuantumInterdictionGenerator',
  }
  return map[hp.category] || ''
}
function swapMaxSize(hp: Hardpoint, comp: HardpointComponent | null): number {
  if (comp?.port_max_size && comp.port_max_size > 0) return comp.port_max_size
  const mt = getMountType(hp)
  const base = hp.port_max_size || hp.mount_size || 0
  if (mt === 'Fixed') return base
  if (mt === 'Gimbal') return Math.max(base - 1, 1)
  return base || (comp?.size && comp.size > 0 ? comp.size : 0)
}
function subMaxSize(_hp: Hardpoint, _item: HardpointComponent, sub: HardpointSubItem): number {
  return sub.port_max_size || sub.size || 0
}

function clickSlot(hp: Hardpoint, item: HardpointComponent) {
  if (!item.uuid) return
  openSelector(item.port_id, item.port_name, swapTypeForHp(hp, item), swapMaxSize(hp, item), item as Record<string, unknown>, hp.port_id)
}
function clickDirectSlot(hp: Hardpoint) {
  if (!hp.component) return
  openSelector(hp.component.port_id, hp.component.port_name, swapTypeForHp(hp, hp.component), swapMaxSize(hp, hp.component), hp.component as Record<string, unknown>, hp.port_id)
}
function clickSubSlot(hp: Hardpoint, item: HardpointComponent, sub: HardpointSubItem) {
  if (!sub.uuid) return
  openSelector(sub.port_id, sub.port_name, sub.type || 'WeaponGun', subMaxSize(hp, item, sub), sub as unknown as Record<string, unknown>, hp.port_id)
}

// ── Selector column config per type ──
function selectorColumns(type: string): { key: string; label: string; right?: boolean }[] {
  if (type === 'WeaponGun') return [
    { key: 'name', label: 'Name' },
    { key: 'sub_type', label: 'Type' },
    { key: 'weapon_burst_dps', label: 'Burst DPS', right: true },
    { key: 'weapon_fire_rate', label: 'Fire rate', right: true },
    { key: 'weapon_range', label: 'Range', right: true },
    { key: 'power_draw', label: 'Power', right: true },
    { key: 'hp', label: 'Hp', right: true },
  ]
  if (type === 'Missile') return [
    { key: 'name', label: 'Name' },
    { key: 'missile_signal_type', label: 'Signal' },
    { key: 'missile_damage', label: 'Damage', right: true },
    { key: 'missile_speed', label: 'Speed', right: true },
    { key: 'missile_range', label: 'Range', right: true },
    { key: 'hp', label: 'Hp', right: true },
  ]
  if (type === 'MissileRack' || type === 'MissileLauncher') return [
    { key: 'name', label: 'Name' },
    { key: 'hp', label: 'Hp', right: true },
  ]
  if (type === 'Shield') return [
    { key: 'name', label: 'Name' },
    { key: 'shield_hp', label: 'HP', right: true },
    { key: 'shield_regen', label: 'Regen', right: true },
    { key: 'hp', label: 'Hp', right: true },
  ]
  if (type === 'PowerPlant') return [
    { key: 'name', label: 'Name' },
    { key: 'power_output', label: 'Output', right: true },
    { key: 'hp', label: 'Hp', right: true },
  ]
  if (type === 'Cooler') return [
    { key: 'name', label: 'Name' },
    { key: 'cooling_rate', label: 'Cooling', right: true },
    { key: 'hp', label: 'Hp', right: true },
  ]
  if (type === 'QuantumDrive') return [
    { key: 'name', label: 'Name' },
    { key: 'qd_speed', label: 'Speed', right: true },
    { key: 'qd_spool_time', label: 'Spool', right: true },
    { key: 'qd_fuel_rate', label: 'Fuel rate', right: true },
    { key: 'hp', label: 'Hp', right: true },
  ]
  return [
    { key: 'name', label: 'Name' },
    { key: 'hp', label: 'Hp', right: true },
  ]
}

// ── Selector helpers ──
function selectorTypeLabel(type: string): string {
  const map: Record<string, string> = {
    WeaponGun: 'weapon', Missile: 'missile', MissileRack: 'missile rack', MissileLauncher: 'missile rack',
    Shield: 'shield', PowerPlant: 'power plant', Cooler: 'cooler', QuantumDrive: 'quantum drive',
    Radar: 'radar', Countermeasure: 'countermeasure', EMP: 'EMP', QuantumInterdictionGenerator: 'QED',
  }
  return map[type] || type
}

// ── URL persistence ──
function encodeSwaps(): string { return swaps.value.map(s => `${s.portId}:${s.componentUuid}`).join(',') }
function encodeMounts(): string { return Object.entries(mountOverrides.value).map(([id, t]) => `${id}:${t}`).join(',') }
function decodeSwaps(s: string): { portId: number; componentUuid: string }[] {
  if (!s) return []
  return s.split(',').map(p => { const [id, uuid] = p.split(':'); return { portId: parseInt(id), componentUuid: uuid } }).filter(x => !isNaN(x.portId) && x.componentUuid)
}
function decodeMounts(s: string): Record<number, string> {
  if (!s) return {}
  const r: Record<number, string> = {}
  for (const p of s.split(',')) { const [id, t] = p.split(':'); const n = parseInt(id); if (!isNaN(n) && t) r[n] = t }
  return r
}

watch([swaps, mountOverrides], () => {
  const q = { ...route.query }
  const sw = encodeSwaps(); sw ? q.swaps = sw : delete q.swaps
  const mt = encodeMounts(); mt ? q.mounts = mt : delete q.mounts
  router.replace({ query: q })
}, { deep: true })

// ── Init ──
onMounted(async () => {
  const uuid = route.params.uuid as string
  if (!uuid) return
  loading.value = true
  try {
    if (route.query.swaps) swaps.value = decodeSwaps(route.query.swaps as string)
    if (route.query.mounts) mountOverrides.value = decodeMounts(route.query.mounts as string)
    loadout.value = (await calculateLoadout(uuid, swaps.value)).data
    if (loadout.value?.ship) {
      selectedShip.value = { uuid: loadout.value.ship.uuid, name: loadout.value.ship.name } as Ship
      shipQuery.value = loadout.value.ship.name
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Erreur loadout'
  } finally { loading.value = false }
})

// Color maps
const catBorder: Record<string, string> = {
  red: 'border-red-500/30', blue: 'border-blue-500/30', orange: 'border-orange-500/30', yellow: 'border-yellow-500/30',
  cyan: 'border-cyan-500/30', purple: 'border-purple-500/30', green: 'border-green-500/30', emerald: 'border-emerald-500/30',
  amber: 'border-amber-500/30', lime: 'border-lime-500/30', sky: 'border-sky-500/30', teal: 'border-teal-500/30',
}
const catText: Record<string, string> = {
  red: 'text-red-400', blue: 'text-blue-400', orange: 'text-orange-400', yellow: 'text-yellow-400',
  cyan: 'text-cyan-400', purple: 'text-purple-400', green: 'text-green-400', emerald: 'text-emerald-400',
  amber: 'text-amber-400', lime: 'text-lime-400', sky: 'text-sky-400', teal: 'text-teal-400',
}
const catBg: Record<string, string> = {
  red: 'bg-red-500/5', blue: 'bg-blue-500/5', orange: 'bg-orange-500/5', yellow: 'bg-yellow-500/5',
  cyan: 'bg-cyan-500/5', purple: 'bg-purple-500/5', green: 'bg-green-500/5', emerald: 'bg-emerald-500/5',
  amber: 'bg-amber-500/5', lime: 'bg-lime-500/5', sky: 'bg-sky-500/5', teal: 'bg-teal-500/5',
}

const totalMods = computed(() => swaps.value.length + Object.keys(mountOverrides.value).length)

// ── Group identical sub-items (missiles, etc.) ──
interface GroupedItem {
  item: HardpointComponent
  count: number
  allPortIds: number[]
}
function groupItems(items: HardpointComponent[]): GroupedItem[] {
  const groups: GroupedItem[] = []
  for (const item of items) {
    const key = item.uuid || item.name || item.display_name || ''
    const existing = groups.find(g => {
      const gKey = g.item.uuid || g.item.name || g.item.display_name || ''
      return gKey === key && key !== ''
    })
    if (existing) {
      existing.count++
      existing.allPortIds.push(item.port_id)
    } else {
      groups.push({ item, count: 1, allPortIds: [item.port_id] })
    }
  }
  return groups
}
</script>

<template>
  <div class="space-y-3">

    <!-- ═══ Ship Picker ═══ -->
    <div class="card p-3 relative z-20" ref="shipSearchRef">
      <div class="flex items-center gap-3">
        <div class="flex-1 relative">
          <div class="flex items-center gap-2 mb-1">
            <h1 class="text-xs font-bold text-sv-text-bright uppercase tracking-widest">Loadout Manager</h1>
            <span v-if="loadout" class="text-[10px] text-sv-muted">{{ loadout.ship.name }}</span>
          </div>
          <input v-model="shipQuery" @input="debouncedShipSearch(shipQuery)" class="input w-full text-sm" placeholder="Rechercher un vaisseau…" />
          <div v-if="shipResults.length" class="absolute z-50 left-0 right-0 mt-1 bg-sv-panel border border-sv-border rounded-lg shadow-2xl max-h-56 overflow-y-auto">
            <div v-for="s in shipResults" :key="s.uuid" @click="selectShip(s)"
              class="px-3 py-2 hover:bg-sv-accent/10 cursor-pointer text-xs border-b border-sv-border/20 last:border-0 flex items-center justify-between">
              <div>
                <span class="text-sv-text-bright font-medium">{{ s.name }}</span>
                <span class="text-sv-muted ml-2 text-[10px]">{{ s.manufacturer_code }}</span>
              </div>
              <span class="text-[10px] text-sv-muted">{{ s.role }}</span>
            </div>
          </div>
        </div>
        <button v-if="totalMods > 0" @click="resetAll"
          class="px-3 py-1.5 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/20 transition whitespace-nowrap">
          ↺ Reset all ({{ totalMods }})
        </button>
      </div>
    </div>

    <div v-if="error" class="card border-red-500/50 p-3 text-red-400 text-sm">{{ error }}</div>

    <!-- ═══ Main 3-Column Layout ═══ -->
    <LoadingState :loading="loading">
      <div v-if="loadout" class="grid grid-cols-1 lg:grid-cols-3 gap-3">

        <!-- ═══ COLUMN 1: Turrets, Weapons, Missiles ═══ -->
        <div class="space-y-3">
          <template v-for="group in columns.left" :key="group.category">
            <!-- Category card -->
            <div class="card overflow-hidden border" :class="catBorder[group.color] || 'border-sv-border'">
              <!-- Header: icon + label + bar + RESET -->
              <div class="flex items-center justify-between px-3 py-1.5" :class="catBg[group.color]">
                <div class="flex items-center gap-2">
                  <span class="text-sm">{{ group.icon }}</span>
                  <span class="text-[10px] font-bold uppercase tracking-wider" :class="catText[group.color]">{{ group.label }}</span>
                </div>
                <button @click="resetCategory(group.category)" class="text-[9px] uppercase font-bold tracking-wider text-sv-muted hover:text-amber-400 transition">Reset</button>
              </div>

              <!-- Hardpoints -->
              <div v-for="hp in group.items" :key="hp.port_id" class="border-t border-sv-border/20">
                <!-- ── Hierarchical ── -->
                <template v-if="hp.items.length > 0">
                  <!-- Mount header -->
                  <div class="px-3 py-1.5 bg-sv-darker/40 flex items-center gap-2">
                    <span class="inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-bold border border-sv-border/40 bg-sv-darker/80" :class="catText[group.color]">S{{ hp.port_max_size || hp.mount_size || '?' }}</span>
                    <span class="text-sm">{{ group.icon }}</span>
                    <span class="text-[11px] text-sv-text-bright font-medium">{{ hp.display_name }}</span>
                    <!-- Lock icon for turrets -->
                    <span v-if="hp.mount_type === 'Turret'" class="text-[10px] text-amber-400" title="Remote turret">🔒</span>
                    <!-- Mount toggle -->
                    <template v-if="hp.mount_type === 'Gimbal' || hp.mount_type === 'Fixed' || getMountType(hp) === 'Gimbal' || getMountType(hp) === 'Fixed'">
                      <button @click="cycleMountType(hp)" class="ml-auto text-[10px] text-sv-muted hover:text-sv-text" title="Changer le type de mount">↕</button>
                    </template>
                  </div>

                  <!-- Items (gimbals/weapons) -->
                  <div v-for="item in hp.items" :key="item.port_id">
                    <!-- Mount/gimbal row -->
                    <div v-if="item.sub_items?.length" class="px-3 py-1 pl-6 bg-sv-darker/20 flex items-center gap-2">
                      <span class="inline-flex items-center justify-center w-5 h-4 rounded text-[8px] font-bold border border-sv-border/30 bg-sv-darker/60" :class="catText[group.color]">S{{ item.size || '?' }}</span>
                      <span class="text-[10px]">{{ group.icon }}</span>
                      <span class="text-[10px] text-amber-400 font-medium">{{ item.display_name || item.name }}</span>
                      <template v-if="getMountType(hp) === 'Gimbal' || getMountType(hp) === 'Fixed'">
                        <span class="text-[8px] px-1 py-0.5 rounded font-bold" :class="MOUNT_TYPE_LABELS[getMountType(hp) || '']?.badge || 'bg-gray-500/20 text-gray-400'">
                          {{ getMountType(hp) === 'Gimbal' ? 'GBL' : 'FXD' }}
                        </span>
                      </template>
                      <span v-if="item.sub_items.length > 1" class="text-[9px] text-amber-400">x{{ item.sub_items.length }}</span>
                      <span v-if="isMountOverridden(hp)" class="text-[7px] text-amber-300 bg-amber-500/15 px-1 rounded">MOD</span>
                      <!-- Swap mount button -->
                      <button v-if="item.uuid" @click.stop="clickSlot(hp, item)"
                        class="ml-auto text-[9px] text-sv-muted hover:text-sv-accent transition" title="Changer le mount">⟳</button>
                      <button v-if="item.swapped" @click.stop="removeSwap(item.port_id)"
                        class="text-[9px] text-amber-400 hover:text-red-400 transition" title="Rétablir">✕</button>
                    </div>

                    <!-- Sub-items (actual weapons inside gimbals) -->
                    <template v-if="item.sub_items?.length">
                      <div v-for="sub in item.sub_items" :key="sub.port_id"
                        class="px-3 py-1 pl-10 flex items-center gap-2 cursor-pointer transition-colors group/sub"
                        :class="[
                          selectorTarget?.portId === sub.port_id ? 'bg-sv-accent/10 ring-1 ring-inset ring-sv-accent/30' : 'hover:bg-sv-panel-light/10',
                          sub.swapped ? 'bg-amber-500/5' : ''
                        ]"
                        @click="clickSubSlot(hp, item, sub)">
                        <span class="inline-flex items-center justify-center w-5 h-4 rounded text-[8px] font-bold border border-sv-border/30" :class="sub.swapped ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-sv-darker/60 text-sv-muted'">S{{ sub.size || '?' }}</span>
                        <span class="text-[10px]">⚡</span>
                        <span class="text-[10px] font-medium flex-1 truncate" :class="sub.swapped ? 'text-amber-300' : 'text-amber-400'">{{ sub.display_name || sub.name || 'Empty' }}</span>
                        <span v-if="sub.sub_type || sub.type" class="text-[8px] text-sv-muted italic hidden sm:inline">{{ sub.sub_type || '' }}</span>
                        <!-- Weapon inline stats -->
                        <div class="hidden sm:flex items-center gap-3 text-[9px] font-mono shrink-0">
                          <span v-if="sub.weapon_dps" class="text-amber-400">{{ fmt(sub.weapon_dps, 0) }} <span class="text-sv-muted">dps</span></span>
                          <span v-if="sub.missile_damage" class="text-amber-400">{{ fmt(sub.missile_damage, 0) }} <span class="text-sv-muted">dmg</span></span>
                        </div>
                        <button v-if="sub.swapped" @click.stop="removeSwap(sub.port_id)"
                          class="opacity-0 group-hover/sub:opacity-100 text-[9px] text-amber-400 hover:text-red-400 transition" title="Rétablir">✕</button>
                      </div>

                      <!-- Sub-weapon extra stats row -->
                      <div v-for="sub in item.sub_items.slice(0, 1)" :key="'stats-' + sub.port_id"
                        class="px-3 py-0.5 pl-10 flex items-center gap-3 text-[8px] font-mono text-sv-muted">
                        <template v-if="sub.weapon_range"><span>range <span class="text-amber-400/80">{{ fmt(sub.weapon_range, 0) }}</span></span></template>
                        <template v-if="sub.weapon_fire_rate"><span>fire rate <span class="text-amber-400/80">{{ fmt(sub.weapon_fire_rate, 0) }}</span></span></template>
                        <template v-if="sub.missile_speed"><span>speed <span class="text-amber-400/80">{{ fmt(sub.missile_speed, 0) }}</span> m/s</span></template>
                        <template v-if="sub.missile_range"><span>range <span class="text-amber-400/80">{{ fmt(sub.missile_range, 0) }}</span> m</span></template>
                      </div>
                    </template>

                    <!-- Direct weapon (no sub_items, weapon directly on mount) -->
                    <template v-else>
                      <div class="px-3 py-1 pl-6 flex items-center gap-2 cursor-pointer transition-colors group/slot"
                        :class="[
                          selectorTarget?.portId === item.port_id ? 'bg-sv-accent/10 ring-1 ring-inset ring-sv-accent/30' : 'hover:bg-sv-panel-light/10',
                          item.swapped ? 'bg-amber-500/5' : ''
                        ]"
                        @click="clickSlot(hp, item)">
                        <span class="inline-flex items-center justify-center w-5 h-4 rounded text-[8px] font-bold border border-sv-border/30" :class="item.swapped ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-sv-darker/60 text-sv-muted'">S{{ item.size || '?' }}</span>
                        <span class="text-[10px]">⚡</span>
                        <span class="text-[10px] font-medium truncate flex-1" :class="item.swapped ? 'text-amber-300' : 'text-amber-400'">{{ item.display_name || item.name || 'Empty' }}</span>
                        <span v-if="item.sub_type || item.type" class="text-[8px] text-sv-muted italic hidden sm:inline">{{ item.sub_type || '' }}</span>
                        <div class="hidden sm:flex items-center gap-3 text-[9px] font-mono shrink-0">
                          <span v-if="item.weapon_dps" class="text-amber-400">{{ fmt(item.weapon_dps, 0) }} <span class="text-sv-muted">dps</span></span>
                          <span v-if="item.missile_damage" class="text-amber-400">{{ fmt(item.missile_damage, 0) }} <span class="text-sv-muted">dmg</span></span>
                        </div>
                        <button v-if="item.swapped" @click.stop="removeSwap(item.port_id)"
                          class="opacity-0 group-hover/slot:opacity-100 text-[9px] text-amber-400 hover:text-red-400 transition" title="Rétablir">✕</button>
                      </div>
                      <!-- Extra stats row -->
                      <div v-if="item.weapon_range || item.weapon_fire_rate || item.missile_speed"
                        class="px-3 py-0.5 pl-6 flex items-center gap-3 text-[8px] font-mono text-sv-muted">
                        <template v-if="item.weapon_range"><span>range <span class="text-amber-400/80">{{ fmt(item.weapon_range, 0) }}</span></span></template>
                        <template v-if="item.weapon_fire_rate"><span>fire rate <span class="text-amber-400/80">{{ fmt(item.weapon_fire_rate, 0) }}</span></span></template>
                        <template v-if="item.missile_speed"><span><span class="text-amber-400/80">{{ fmt(item.missile_speed, 0) }}</span> m/s</span></template>
                        <template v-if="item.missile_range"><span>range <span class="text-amber-400/80">{{ fmt(item.missile_range, 0) }}</span> m</span></template>
                      </div>
                    </template>

                    <!-- ═══ Inline selector under the relevant HP ═══ -->
                    <div v-if="selectorTarget && selectorTarget.hpPortId === hp.port_id && (
                        item.port_id === selectorTarget.portId ||
                        (item.sub_items || []).some(s => s.port_id === selectorTarget!.portId)
                      )"
                      class="border-t border-sv-accent/30 bg-sv-darker/50">
                      <div class="px-3 py-2 flex items-center gap-2 flex-wrap">
                        <span class="text-[10px] text-sv-muted">Select {{ selectorTypeLabel(selectorTarget.type) }} or</span>
                        <button @click="leaveEmpty" class="text-[9px] px-2 py-1 rounded bg-sv-darker border border-sv-border/40 text-sv-text hover:bg-sv-panel-light/30 transition font-medium">leave empty</button>
                        <div class="flex-1"></div>
                        <div class="relative">
                          <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-amber-400 font-bold">Filter</span>
                          <input ref="selectorInputRef" v-model="selectorQuery" @input="debouncedSelectorSearch(selectorQuery)"
                            class="input text-xs py-1 pl-12 w-40 sm:w-56" />
                        </div>
                        <button @click="closeSelector" class="text-[10px] text-sv-muted hover:text-red-400 transition">✕</button>
                      </div>
                      <!-- Table selector -->
                      <div class="overflow-x-auto">
                        <table class="w-full text-[9px]">
                          <thead>
                            <tr class="text-sv-muted border-b border-sv-border/30">
                              <th class="text-center py-1 px-1 font-medium w-8">S</th>
                              <th v-for="col in selectorColumns(selectorTarget.type)" :key="col.key"
                                class="py-1 px-1.5 font-medium cursor-pointer hover:text-sv-text transition select-none whitespace-nowrap"
                                :class="col.right ? 'text-right' : 'text-left'"
                                @click="toggleSort(col.key)">
                                {{ col.label }}{{ sortArrow(col.key) }}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-if="selectorLoading">
                              <td :colspan="selectorColumns(selectorTarget.type).length + 1" class="py-4 text-center text-sv-muted">Chargement…</td>
                            </tr>
                            <tr v-else-if="!sortedSelectorResults.length">
                              <td :colspan="selectorColumns(selectorTarget.type).length + 1" class="py-4 text-center text-sv-muted">Aucun résultat</td>
                            </tr>
                            <tr v-for="c in sortedSelectorResults" :key="c.uuid" @click="applySwap(c)"
                              class="border-b border-sv-border/10 cursor-pointer hover:bg-sv-accent/5 transition-colors">
                              <td class="py-1 px-1 text-center text-sv-muted">S{{ c.size }}</td>
                              <td v-for="col in selectorColumns(selectorTarget.type)" :key="col.key"
                                class="py-1 px-1.5 whitespace-nowrap"
                                :class="[col.right ? 'text-right font-mono' : 'text-left', col.key === 'name' ? 'text-amber-400 font-medium' : 'text-sv-text']">
                                <template v-if="col.key === 'name'">{{ c.name }}</template>
                                <template v-else>{{ (c as Record<string, unknown>)[col.key] != null ? fmt((c as Record<string, unknown>)[col.key] as number) : '—' }}</template>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </template>

                <!-- ── Direct component ── -->
                <template v-else-if="hp.component">
                  <div class="px-3 py-1.5 flex items-center gap-2 cursor-pointer transition-colors group/slot"
                    :class="[
                      selectorTarget?.portId === hp.component.port_id ? 'bg-sv-accent/10 ring-1 ring-inset ring-sv-accent/30' : 'hover:bg-sv-panel-light/10',
                      hp.component.swapped ? 'bg-amber-500/5' : ''
                    ]"
                    @click="clickDirectSlot(hp)">
                    <span class="inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-bold border border-sv-border/40 bg-sv-darker/80" :class="hp.component.swapped ? 'text-amber-400 border-amber-500/40' : catText[group.color]">S{{ hp.component.size || '?' }}</span>
                    <span class="text-sm">{{ group.icon }}</span>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span class="text-[11px] font-medium truncate" :class="hp.component.swapped ? 'text-amber-300' : 'text-sv-text-bright'">{{ hp.component.display_name || hp.component.name || 'Empty' }}</span>
                        <span v-if="hp.component.grade" class="text-[8px] text-sv-muted italic">{{ hp.component.grade }}</span>
                        <span v-if="hp.component.swapped" class="text-[7px] px-1 rounded bg-amber-500/15 text-amber-300">SWAP</span>
                      </div>
                    </div>
                    <!-- Inline stat -->
                    <div class="hidden sm:flex items-center gap-3 text-[10px] font-mono shrink-0">
                      <template v-if="hp.component.shield_hp"><span class="text-amber-400 font-bold">{{ fmt(hp.component.shield_hp, 0) }}</span> <span class="text-sv-muted text-[8px]">hp</span></template>
                      <template v-if="hp.component.shield_regen"><span class="text-sv-muted text-[8px]">regen</span> <span class="text-amber-400/80">{{ fmt(hp.component.shield_regen, 1) }}</span></template>
                      <template v-if="hp.component.power_output"><span class="text-amber-400 font-bold">{{ fmt(hp.component.power_output, 0) }}</span> <span class="text-sv-muted text-[8px]">power</span></template>
                      <template v-if="hp.component.cooling_rate"><span class="text-amber-400 font-bold">{{ fmt(hp.component.cooling_rate, 0) }}</span> <span class="text-sv-muted text-[8px]">cooling</span></template>
                      <template v-if="hp.component.qd_speed"><span class="text-amber-400 font-bold">{{ fmt(hp.component.qd_speed) }}</span> <span class="text-sv-muted text-[8px]">m/s</span></template>
                      <template v-if="hp.component.cm_ammo"><span class="text-amber-400">{{ hp.component.cm_ammo }}</span></template>
                      <template v-if="hp.component.radar_range"><span class="text-amber-400">{{ fmt(hp.component.radar_range, 0) }}m</span></template>
                      <template v-if="hp.component.emp_damage"><span class="text-amber-400">{{ fmt(hp.component.emp_damage, 0) }} dmg</span></template>
                    </div>
                    <button v-if="hp.component.swapped" @click.stop="removeSwap(hp.component.port_id)"
                      class="opacity-0 group-hover/slot:opacity-100 text-[9px] text-amber-400 hover:text-red-400 transition" title="Rétablir">✕</button>
                  </div>
                  <!-- Extra stats row for shields -->
                  <div v-if="hp.component.shield_hp" class="px-3 py-0.5 pl-8 flex items-center gap-3 text-[8px] font-mono text-sv-muted">
                    <span>⚡{{ hp.component.power_draw || '?' }}</span>
                    <span>🛡️{{ hp.component.shield_hp ? 'faces ' + (hp.component.type === 'Shield' ? '—' : '') : '' }}</span>
                    <span v-if="hp.component.shield_regen">full charge in <span class="text-amber-400/80">{{ loadout.stats.shields.time_to_charge || '—' }}</span> s</span>
                  </div>
                  <!-- Extra stats row for QD -->
                  <div v-if="hp.component.qd_speed" class="px-3 py-0.5 pl-8 flex items-center gap-3 text-[8px] font-mono text-sv-muted">
                    <template v-if="hp.component.qd_fuel_rate"><span>fuel rate <span class="text-amber-400/80">{{ hp.component.qd_fuel_rate }}</span></span></template>
                    <template v-if="hp.component.qd_range"><span>max distance <span class="text-amber-400/80">{{ fmt(hp.component.qd_range) }}</span></span></template>
                    <template v-if="hp.component.qd_cooldown"><span>cooldown <span class="text-amber-400/80">{{ hp.component.qd_cooldown }}s</span></span></template>
                  </div>
                  <!-- Power plant extra -->
                  <div v-if="hp.component.power_output" class="px-3 py-0.5 pl-8 flex items-center gap-3 text-[8px] font-mono text-sv-muted">
                    <span>⚡{{ hp.component.power_draw || '?' }}</span>
                  </div>

                  <!-- Inline selector for direct component -->
                  <div v-if="selectorTarget && selectorTarget.portId === hp.component.port_id"
                    class="border-t border-sv-accent/30 bg-sv-darker/50">
                    <div class="px-3 py-2 flex items-center gap-2 flex-wrap">
                      <span class="text-[10px] text-sv-muted">Select {{ selectorTypeLabel(selectorTarget.type) }} or</span>
                      <button @click="leaveEmpty" class="text-[9px] px-2 py-1 rounded bg-sv-darker border border-sv-border/40 text-sv-text hover:bg-sv-panel-light/30 transition font-medium">leave empty</button>
                      <div class="flex-1"></div>
                      <div class="relative">
                        <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-amber-400 font-bold">Filter</span>
                        <input ref="selectorInputRef" v-model="selectorQuery" @input="debouncedSelectorSearch(selectorQuery)"
                          class="input text-xs py-1 pl-12 w-40 sm:w-56" />
                      </div>
                      <button @click="closeSelector" class="text-[10px] text-sv-muted hover:text-red-400 transition">✕</button>
                    </div>
                    <div class="overflow-x-auto">
                      <table class="w-full text-[9px]">
                        <thead>
                          <tr class="text-sv-muted border-b border-sv-border/30">
                            <th class="text-center py-1 px-1 font-medium w-8">S</th>
                            <th v-for="col in selectorColumns(selectorTarget.type)" :key="col.key"
                              class="py-1 px-1.5 font-medium cursor-pointer hover:text-sv-text transition select-none whitespace-nowrap"
                              :class="col.right ? 'text-right' : 'text-left'"
                              @click="toggleSort(col.key)">
                              {{ col.label }}{{ sortArrow(col.key) }}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-if="selectorLoading"><td :colspan="selectorColumns(selectorTarget.type).length + 1" class="py-4 text-center text-sv-muted">Chargement…</td></tr>
                          <tr v-else-if="!sortedSelectorResults.length"><td :colspan="selectorColumns(selectorTarget.type).length + 1" class="py-4 text-center text-sv-muted">Aucun résultat</td></tr>
                          <tr v-for="c in sortedSelectorResults" :key="c.uuid" @click="applySwap(c)"
                            class="border-b border-sv-border/10 cursor-pointer hover:bg-sv-accent/5 transition-colors">
                            <td class="py-1 px-1 text-center text-sv-muted">S{{ c.size }}</td>
                            <td v-for="col in selectorColumns(selectorTarget.type)" :key="col.key"
                              class="py-1 px-1.5 whitespace-nowrap"
                              :class="[col.right ? 'text-right font-mono' : 'text-left', col.key === 'name' ? 'text-amber-400 font-medium' : 'text-sv-text']">
                              <template v-if="col.key === 'name'">{{ c.name }}</template>
                              <template v-else>{{ (c as Record<string, unknown>)[col.key] != null ? fmt((c as Record<string, unknown>)[col.key] as number) : '—' }}</template>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </template>
        </div>

        <!-- ═══ COLUMN 2: Shields, Power Plants ═══ -->
        <div class="space-y-3">
          <template v-for="group in columns.mid" :key="group.category">
            <div class="card overflow-hidden border" :class="catBorder[group.color] || 'border-sv-border'">
              <div class="flex items-center justify-between px-3 py-1.5" :class="catBg[group.color]">
                <div class="flex items-center gap-2">
                  <span class="text-sm">{{ group.icon }}</span>
                  <span class="text-[10px] font-bold uppercase tracking-wider" :class="catText[group.color]">{{ group.label }}</span>
                </div>
                <button @click="resetCategory(group.category)" class="text-[9px] uppercase font-bold tracking-wider text-sv-muted hover:text-amber-400 transition">Reset</button>
              </div>
              <div v-for="hp in group.items" :key="hp.port_id" class="border-t border-sv-border/20">
                <template v-if="hp.component">
                  <div class="px-3 py-1.5 flex items-center gap-2 cursor-pointer transition-colors group/slot"
                    :class="[
                      selectorTarget?.portId === hp.component.port_id ? 'bg-sv-accent/10 ring-1 ring-inset ring-sv-accent/30' : 'hover:bg-sv-panel-light/10',
                      hp.component.swapped ? 'bg-amber-500/5' : ''
                    ]"
                    @click="clickDirectSlot(hp)">
                    <span class="inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-bold border border-sv-border/40 bg-sv-darker/80" :class="hp.component.swapped ? 'text-amber-400 border-amber-500/40' : catText[group.color]">S{{ hp.component.size || '?' }}</span>
                    <span class="text-sm">{{ group.icon }}</span>
                    <div class="flex-1 min-w-0">
                      <span class="text-[11px] font-medium truncate" :class="hp.component.swapped ? 'text-amber-300' : 'text-sv-text-bright'">{{ hp.component.display_name || hp.component.name || 'Empty' }}</span>
                      <span v-if="hp.component.grade" class="text-[8px] text-sv-muted italic ml-1">{{ hp.component.grade }}</span>
                      <span v-if="hp.component.swapped" class="text-[7px] px-1 ml-1 rounded bg-amber-500/15 text-amber-300">SWAP</span>
                    </div>
                    <div class="flex items-center gap-2 text-[10px] font-mono shrink-0">
                      <template v-if="hp.component.shield_hp"><span class="text-amber-400 font-bold">{{ fmt(hp.component.shield_hp, 0) }}</span> <span class="text-sv-muted text-[8px]">hp</span></template>
                      <template v-if="hp.component.power_output"><span class="text-amber-400 font-bold">{{ fmt(hp.component.power_output, 0) }}</span> <span class="text-sv-muted text-[8px]">power</span></template>
                    </div>
                    <button v-if="hp.component.swapped" @click.stop="removeSwap(hp.component.port_id)"
                      class="opacity-0 group-hover/slot:opacity-100 text-[9px] text-amber-400 hover:text-red-400 transition">✕</button>
                  </div>
                  <!-- Extra stats -->
                  <div v-if="hp.component.shield_hp || hp.component.shield_regen" class="px-3 py-0.5 pl-8 flex items-center gap-3 text-[8px] font-mono text-sv-muted">
                    <span>⚡{{ hp.component.power_draw || '?' }}</span>
                    <span>🛡️ {{ hp.component.shield_regen ? fmt(hp.component.shield_regen, 1) + '/s' : '' }}</span>
                    <span v-if="hp.component.shield_regen && hp.component.shield_hp">full charge in <span class="text-amber-400/80">{{ Math.round((hp.component.shield_hp || 0) / (hp.component.shield_regen || 1)) }}</span> s</span>
                  </div>
                  <div v-if="hp.component.power_output" class="px-3 py-0.5 pl-8 flex items-center gap-3 text-[8px] font-mono text-sv-muted">
                    <span>⚡{{ hp.component.power_draw || '?' }}</span>
                  </div>

                  <!-- Selector -->
                  <div v-if="selectorTarget && selectorTarget.portId === hp.component.port_id"
                    class="border-t border-sv-accent/30 bg-sv-darker/50">
                    <div class="px-3 py-2 flex items-center gap-2 flex-wrap">
                      <span class="text-[10px] text-sv-muted">Select {{ selectorTypeLabel(selectorTarget.type) }} or</span>
                      <button @click="leaveEmpty" class="text-[9px] px-2 py-1 rounded bg-sv-darker border border-sv-border/40 text-sv-text hover:bg-sv-panel-light/30 transition font-medium">leave empty</button>
                      <div class="flex-1"></div>
                      <div class="relative">
                        <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-amber-400 font-bold">Filter</span>
                        <input ref="selectorInputRef" v-model="selectorQuery" @input="debouncedSelectorSearch(selectorQuery)" class="input text-xs py-1 pl-12 w-40 sm:w-56" />
                      </div>
                      <button @click="closeSelector" class="text-[10px] text-sv-muted hover:text-red-400 transition">✕</button>
                    </div>
                    <div class="overflow-x-auto">
                      <table class="w-full text-[9px]">
                        <thead><tr class="text-sv-muted border-b border-sv-border/30">
                          <th class="text-center py-1 px-1 font-medium w-8">S</th>
                          <th v-for="col in selectorColumns(selectorTarget.type)" :key="col.key"
                            class="py-1 px-1.5 font-medium cursor-pointer hover:text-sv-text transition select-none whitespace-nowrap"
                            :class="col.right ? 'text-right' : 'text-left'" @click="toggleSort(col.key)">{{ col.label }}{{ sortArrow(col.key) }}</th>
                        </tr></thead>
                        <tbody>
                          <tr v-if="selectorLoading"><td :colspan="selectorColumns(selectorTarget.type).length + 1" class="py-4 text-center text-sv-muted">Chargement…</td></tr>
                          <tr v-else-if="!sortedSelectorResults.length"><td :colspan="selectorColumns(selectorTarget.type).length + 1" class="py-4 text-center text-sv-muted">Aucun résultat</td></tr>
                          <tr v-for="c in sortedSelectorResults" :key="c.uuid" @click="applySwap(c)"
                            class="border-b border-sv-border/10 cursor-pointer hover:bg-sv-accent/5 transition-colors">
                            <td class="py-1 px-1 text-center text-sv-muted">S{{ c.size }}</td>
                            <td v-for="col in selectorColumns(selectorTarget.type)" :key="col.key"
                              class="py-1 px-1.5 whitespace-nowrap"
                              :class="[col.right ? 'text-right font-mono' : 'text-left', col.key === 'name' ? 'text-amber-400 font-medium' : 'text-sv-text']">
                              <template v-if="col.key === 'name'">{{ c.name }}</template>
                              <template v-else>{{ (c as Record<string, unknown>)[col.key] != null ? fmt((c as Record<string, unknown>)[col.key] as number) : '—' }}</template>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </template>

          <!-- Ship info block (in the middle of col 2, like the screenshot) -->
          <div v-if="loadout" class="card p-4 text-center space-y-2">
            <div class="flex items-center justify-center gap-3">
              <div class="text-3xl opacity-30">🚀</div>
              <div>
                <div class="text-sm font-bold text-sv-text-bright">{{ loadout.ship.name }}</div>
                <div class="text-[9px] text-sv-muted font-mono">{{ loadout.ship.class_name }}</div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9px] text-left max-w-xs mx-auto">
              <div class="flex justify-between"><span class="text-sv-muted">Hull HP</span><span class="text-amber-400 font-mono">{{ fmt(loadout.stats.hull.total_hp) }}</span></div>
              <div class="flex justify-between"><span class="text-sv-muted">EHP</span><span class="text-amber-400 font-mono">{{ fmt(loadout.stats.hull.ehp) }}</span></div>
              <div class="flex justify-between"><span class="text-sv-muted">SCM</span><span class="text-amber-400 font-mono">{{ fmt(loadout.stats.mobility.scm_speed) }} m/s</span></div>
              <div class="flex justify-between"><span class="text-sv-muted">Max</span><span class="text-amber-400 font-mono">{{ fmt(loadout.stats.mobility.max_speed) }} m/s</span></div>
              <div class="flex justify-between"><span class="text-sv-muted">Mass</span><span class="text-sv-text font-mono">{{ fmt(loadout.stats.mobility.mass) }} kg</span></div>
              <div class="flex justify-between"><span class="text-sv-muted">Cargo</span><span class="text-sv-text font-mono">—</span></div>
              <div class="flex justify-between"><span class="text-sv-muted">Pitch</span><span class="text-sv-text font-mono">{{ fmt(loadout.stats.mobility.pitch) }}°/s</span></div>
              <div class="flex justify-between"><span class="text-sv-muted">Yaw</span><span class="text-sv-text font-mono">{{ fmt(loadout.stats.mobility.yaw) }}°/s</span></div>
              <div class="flex justify-between"><span class="text-sv-muted">Roll</span><span class="text-sv-text font-mono">{{ fmt(loadout.stats.mobility.roll) }}°/s</span></div>
              <div class="flex justify-between"><span class="text-sv-muted">H2 Fuel</span><span class="text-amber-400 font-mono">{{ loadout.stats.fuel.hydrogen }}L</span></div>
            </div>
            <!-- Armor bars -->
            <div class="space-y-0.5 pt-1 border-t border-sv-border/20">
              <div class="flex items-center gap-2 text-[8px]">
                <span class="text-sv-muted w-12 text-right">Physical</span>
                <div class="flex-1 h-1 bg-sv-darker rounded-full overflow-hidden"><div class="h-full bg-amber-500 rounded-full" :style="{ width: pct(1 - (loadout.stats.armor.physical || 0)) }"></div></div>
                <span class="text-amber-400 font-mono w-8">{{ pct(1 - (loadout.stats.armor.physical || 0)) }}</span>
              </div>
              <div class="flex items-center gap-2 text-[8px]">
                <span class="text-sv-muted w-12 text-right">Energy</span>
                <div class="flex-1 h-1 bg-sv-darker rounded-full overflow-hidden"><div class="h-full bg-blue-500 rounded-full" :style="{ width: pct(1 - (loadout.stats.armor.energy || 0)) }"></div></div>
                <span class="text-blue-400 font-mono w-8">{{ pct(1 - (loadout.stats.armor.energy || 0)) }}</span>
              </div>
              <div class="flex items-center gap-2 text-[8px]">
                <span class="text-sv-muted w-12 text-right">Distortion</span>
                <div class="flex-1 h-1 bg-sv-darker rounded-full overflow-hidden"><div class="h-full bg-purple-500 rounded-full" :style="{ width: pct(1 - (loadout.stats.armor.distortion || 0)) }"></div></div>
                <span class="text-purple-400 font-mono w-8">{{ pct(1 - (loadout.stats.armor.distortion || 0)) }}</span>
              </div>
            </div>
            <!-- Signatures -->
            <div class="space-y-0.5 pt-1 border-t border-sv-border/20">
              <div class="flex items-center gap-2 text-[8px]">
                <span class="text-sv-muted w-6 text-right">IR</span>
                <div class="flex-1 h-1 bg-sv-darker rounded-full overflow-hidden"><div class="h-full bg-red-500 rounded-full" :style="{ width: Math.min(100, (loadout.stats.signatures.ir || 0) * 50) + '%' }"></div></div>
                <span class="text-red-400 font-mono w-8">{{ loadout.stats.signatures.ir?.toFixed(2) || '—' }}</span>
              </div>
              <div class="flex items-center gap-2 text-[8px]">
                <span class="text-sv-muted w-6 text-right">EM</span>
                <div class="flex-1 h-1 bg-sv-darker rounded-full overflow-hidden"><div class="h-full bg-blue-500 rounded-full" :style="{ width: Math.min(100, (loadout.stats.signatures.em || 0) * 50) + '%' }"></div></div>
                <span class="text-blue-400 font-mono w-8">{{ loadout.stats.signatures.em?.toFixed(2) || '—' }}</span>
              </div>
              <div class="flex items-center gap-2 text-[8px]">
                <span class="text-sv-muted w-6 text-right">CS</span>
                <div class="flex-1 h-1 bg-sv-darker rounded-full overflow-hidden"><div class="h-full bg-amber-500 rounded-full" :style="{ width: Math.min(100, (loadout.stats.signatures.cs || 0) * 50) + '%' }"></div></div>
                <span class="text-amber-400 font-mono w-8">{{ loadout.stats.signatures.cs?.toFixed(2) || '—' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ COLUMN 3: Coolers, QD, Radar, CM, EMP, QED, etc. ═══ -->
        <div class="space-y-3">
          <template v-for="group in columns.right" :key="group.category">
            <div class="card overflow-hidden border" :class="catBorder[group.color] || 'border-sv-border'">
              <div class="flex items-center justify-between px-3 py-1.5" :class="catBg[group.color]">
                <div class="flex items-center gap-2">
                  <span class="text-sm">{{ group.icon }}</span>
                  <span class="text-[10px] font-bold uppercase tracking-wider" :class="catText[group.color]">{{ group.label }}</span>
                </div>
                <button @click="resetCategory(group.category)" class="text-[9px] uppercase font-bold tracking-wider text-sv-muted hover:text-amber-400 transition">Reset</button>
              </div>
              <div v-for="hp in group.items" :key="hp.port_id" class="border-t border-sv-border/20">

                <!-- Hierarchical items -->
                <template v-if="hp.items.length > 0">
                  <div v-for="item in hp.items" :key="item.port_id">
                    <div class="px-3 py-1.5 flex items-center gap-2 cursor-pointer transition-colors group/slot"
                      :class="[
                        selectorTarget?.portId === item.port_id ? 'bg-sv-accent/10 ring-1 ring-inset ring-sv-accent/30' : 'hover:bg-sv-panel-light/10',
                        item.swapped ? 'bg-amber-500/5' : ''
                      ]"
                      @click="clickSlot(hp, item)">
                      <span class="inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-bold border border-sv-border/40 bg-sv-darker/80" :class="item.swapped ? 'text-amber-400 border-amber-500/40' : catText[group.color]">S{{ item.size || '?' }}</span>
                      <span class="text-sm">{{ group.icon }}</span>
                      <span class="text-[11px] font-medium truncate flex-1" :class="item.swapped ? 'text-amber-300' : 'text-sv-text-bright'">{{ item.display_name || item.name || 'Empty' }}</span>
                      <span v-if="item.grade" class="text-[8px] text-sv-muted italic">{{ item.grade }}</span>
                      <div class="hidden sm:flex items-center gap-2 text-[10px] font-mono shrink-0">
                        <template v-if="item.cooling_rate"><span class="text-amber-400">{{ fmt(item.cooling_rate, 0) }}</span> <span class="text-sv-muted text-[8px]">cooling</span></template>
                        <template v-if="item.qd_speed"><span class="text-amber-400">{{ fmt(item.qd_speed) }}</span> <span class="text-sv-muted text-[8px]">m/s</span></template>
                        <template v-if="item.radar_range"><span class="text-amber-400">{{ fmt(item.radar_range, 0) }}m</span></template>
                        <template v-if="item.cm_ammo"><span class="text-amber-400">{{ item.cm_ammo }}</span></template>
                        <template v-if="item.emp_damage"><span class="text-amber-400">{{ fmt(item.emp_damage, 0) }} dmg</span></template>
                      </div>
                      <button v-if="item.swapped" @click.stop="removeSwap(item.port_id)"
                        class="opacity-0 group-hover/slot:opacity-100 text-[9px] text-amber-400 hover:text-red-400 transition">✕</button>
                    </div>
                    <!-- QD extra stats -->
                    <div v-if="item.qd_speed" class="px-3 py-0.5 pl-8 flex items-center gap-3 text-[8px] font-mono text-sv-muted">
                      <template v-if="item.qd_fuel_rate"><span>fuel rate <span class="text-amber-400/80">{{ item.qd_fuel_rate }}</span></span></template>
                      <template v-if="item.qd_range"><span>max distance <span class="text-amber-400/80">{{ fmt(item.qd_range) }}</span></span></template>
                    </div>

                    <!-- Selector -->
                    <div v-if="selectorTarget && selectorTarget.portId === item.port_id"
                      class="border-t border-sv-accent/30 bg-sv-darker/50">
                      <div class="px-3 py-2 flex items-center gap-2 flex-wrap">
                        <span class="text-[10px] text-sv-muted">Select {{ selectorTypeLabel(selectorTarget.type) }} or</span>
                        <button @click="leaveEmpty" class="text-[9px] px-2 py-1 rounded bg-sv-darker border border-sv-border/40 text-sv-text hover:bg-sv-panel-light/30 transition font-medium">leave empty</button>
                        <div class="flex-1"></div>
                        <div class="relative">
                          <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-amber-400 font-bold">Filter</span>
                          <input ref="selectorInputRef" v-model="selectorQuery" @input="debouncedSelectorSearch(selectorQuery)" class="input text-xs py-1 pl-12 w-40 sm:w-56" />
                        </div>
                        <button @click="closeSelector" class="text-[10px] text-sv-muted hover:text-red-400 transition">✕</button>
                      </div>
                      <div class="overflow-x-auto">
                        <table class="w-full text-[9px]">
                          <thead><tr class="text-sv-muted border-b border-sv-border/30">
                            <th class="text-center py-1 px-1 font-medium w-8">S</th>
                            <th v-for="col in selectorColumns(selectorTarget.type)" :key="col.key"
                              class="py-1 px-1.5 font-medium cursor-pointer hover:text-sv-text transition select-none whitespace-nowrap"
                              :class="col.right ? 'text-right' : 'text-left'" @click="toggleSort(col.key)">{{ col.label }}{{ sortArrow(col.key) }}</th>
                          </tr></thead>
                          <tbody>
                            <tr v-if="selectorLoading"><td :colspan="selectorColumns(selectorTarget.type).length + 1" class="py-4 text-center text-sv-muted">Chargement…</td></tr>
                            <tr v-else-if="!sortedSelectorResults.length"><td :colspan="selectorColumns(selectorTarget.type).length + 1" class="py-4 text-center text-sv-muted">Aucun résultat</td></tr>
                            <tr v-for="c in sortedSelectorResults" :key="c.uuid" @click="applySwap(c)"
                              class="border-b border-sv-border/10 cursor-pointer hover:bg-sv-accent/5 transition-colors">
                              <td class="py-1 px-1 text-center text-sv-muted">S{{ c.size }}</td>
                              <td v-for="col in selectorColumns(selectorTarget.type)" :key="col.key"
                                class="py-1 px-1.5 whitespace-nowrap"
                                :class="[col.right ? 'text-right font-mono' : 'text-left', col.key === 'name' ? 'text-amber-400 font-medium' : 'text-sv-text']">
                                <template v-if="col.key === 'name'">{{ c.name }}</template>
                                <template v-else>{{ (c as Record<string, unknown>)[col.key] != null ? fmt((c as Record<string, unknown>)[col.key] as number) : '—' }}</template>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </template>

                <!-- Direct component -->
                <template v-else-if="hp.component">
                  <div class="px-3 py-1.5 flex items-center gap-2 cursor-pointer transition-colors group/slot"
                    :class="[
                      selectorTarget?.portId === hp.component.port_id ? 'bg-sv-accent/10 ring-1 ring-inset ring-sv-accent/30' : 'hover:bg-sv-panel-light/10',
                      hp.component.swapped ? 'bg-amber-500/5' : ''
                    ]"
                    @click="clickDirectSlot(hp)">
                    <span class="inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-bold border border-sv-border/40 bg-sv-darker/80" :class="hp.component.swapped ? 'text-amber-400 border-amber-500/40' : catText[group.color]">S{{ hp.component.size || '?' }}</span>
                    <span class="text-sm">{{ group.icon }}</span>
                    <span class="text-[11px] font-medium truncate flex-1" :class="hp.component.swapped ? 'text-amber-300' : 'text-sv-text-bright'">{{ hp.component.display_name || hp.component.name || 'Empty' }}</span>
                    <span v-if="hp.component.grade" class="text-[8px] text-sv-muted italic">{{ hp.component.grade }}</span>
                    <span v-if="hp.component.swapped" class="text-[7px] px-1 rounded bg-amber-500/15 text-amber-300">SWAP</span>
                    <div class="hidden sm:flex items-center gap-2 text-[10px] font-mono shrink-0">
                      <template v-if="hp.component.cooling_rate"><span class="text-amber-400">{{ fmt(hp.component.cooling_rate, 0) }}</span> <span class="text-sv-muted text-[8px]">cooling</span></template>
                      <template v-if="hp.component.qd_speed"><span class="text-amber-400">{{ fmt(hp.component.qd_speed) }}</span> <span class="text-sv-muted text-[8px]">m/s</span></template>
                      <template v-if="hp.component.radar_range"><span class="text-amber-400">{{ fmt(hp.component.radar_range, 0) }}m</span></template>
                      <template v-if="hp.component.cm_ammo"><span class="text-amber-400">{{ hp.component.cm_ammo }}</span></template>
                      <template v-if="hp.component.emp_damage"><span class="text-amber-400">{{ fmt(hp.component.emp_damage, 0) }} dmg</span></template>
                    </div>
                    <button v-if="hp.component.swapped" @click.stop="removeSwap(hp.component.port_id)"
                      class="opacity-0 group-hover/slot:opacity-100 text-[9px] text-amber-400 hover:text-red-400 transition">✕</button>
                  </div>
                  <!-- QD extra -->
                  <div v-if="hp.component.qd_speed" class="px-3 py-0.5 pl-8 flex items-center gap-3 text-[8px] font-mono text-sv-muted">
                    <template v-if="hp.component.qd_fuel_rate"><span>fuel rate <span class="text-amber-400/80">{{ hp.component.qd_fuel_rate }}</span></span></template>
                    <template v-if="hp.component.qd_range"><span>max distance <span class="text-amber-400/80">{{ fmt(hp.component.qd_range) }}</span></span></template>
                    <template v-if="hp.component.qd_cooldown"><span>cooldown <span class="text-amber-400/80">{{ hp.component.qd_cooldown }}s</span></span></template>
                  </div>

                  <!-- Selector -->
                  <div v-if="selectorTarget && selectorTarget.portId === hp.component.port_id"
                    class="border-t border-sv-accent/30 bg-sv-darker/50">
                    <div class="px-3 py-2 flex items-center gap-2 flex-wrap">
                      <span class="text-[10px] text-sv-muted">Select {{ selectorTypeLabel(selectorTarget.type) }} or</span>
                      <button @click="leaveEmpty" class="text-[9px] px-2 py-1 rounded bg-sv-darker border border-sv-border/40 text-sv-text hover:bg-sv-panel-light/30 transition font-medium">leave empty</button>
                      <div class="flex-1"></div>
                      <div class="relative">
                        <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-amber-400 font-bold">Filter</span>
                        <input ref="selectorInputRef" v-model="selectorQuery" @input="debouncedSelectorSearch(selectorQuery)" class="input text-xs py-1 pl-12 w-40 sm:w-56" />
                      </div>
                      <button @click="closeSelector" class="text-[10px] text-sv-muted hover:text-red-400 transition">✕</button>
                    </div>
                    <div class="overflow-x-auto">
                      <table class="w-full text-[9px]">
                        <thead><tr class="text-sv-muted border-b border-sv-border/30">
                          <th class="text-center py-1 px-1 font-medium w-8">S</th>
                          <th v-for="col in selectorColumns(selectorTarget.type)" :key="col.key"
                            class="py-1 px-1.5 font-medium cursor-pointer hover:text-sv-text transition select-none whitespace-nowrap"
                            :class="col.right ? 'text-right' : 'text-left'" @click="toggleSort(col.key)">{{ col.label }}{{ sortArrow(col.key) }}</th>
                        </tr></thead>
                        <tbody>
                          <tr v-if="selectorLoading"><td :colspan="selectorColumns(selectorTarget.type).length + 1" class="py-4 text-center text-sv-muted">Chargement…</td></tr>
                          <tr v-else-if="!sortedSelectorResults.length"><td :colspan="selectorColumns(selectorTarget.type).length + 1" class="py-4 text-center text-sv-muted">Aucun résultat</td></tr>
                          <tr v-for="c in sortedSelectorResults" :key="c.uuid" @click="applySwap(c)"
                            class="border-b border-sv-border/10 cursor-pointer hover:bg-sv-accent/5 transition-colors">
                            <td class="py-1 px-1 text-center text-sv-muted">S{{ c.size }}</td>
                            <td v-for="col in selectorColumns(selectorTarget.type)" :key="col.key"
                              class="py-1 px-1.5 whitespace-nowrap"
                              :class="[col.right ? 'text-right font-mono' : 'text-left', col.key === 'name' ? 'text-amber-400 font-medium' : 'text-sv-text']">
                              <template v-if="col.key === 'name'">{{ c.name }}</template>
                              <template v-else>{{ (c as Record<string, unknown>)[col.key] != null ? fmt((c as Record<string, unknown>)[col.key] as number) : '—' }}</template>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </template>

          <!-- Thrusters summary -->
          <div v-if="loadout?.stats.mobility" class="card overflow-hidden border border-orange-500/30">
            <div class="flex items-center justify-between px-3 py-1.5 bg-orange-500/5">
              <div class="flex items-center gap-2">
                <span class="text-sm">🔥</span>
                <span class="text-[10px] font-bold uppercase tracking-wider text-orange-400">Thrusters</span>
              </div>
            </div>
            <div class="px-3 py-1.5 flex items-center gap-2 text-[10px]">
              <span class="text-sm">🔥</span>
              <span class="text-sv-text-bright font-medium">Main</span>
              <span class="text-sv-muted text-[8px]">boost</span>
              <span class="text-amber-400 font-mono ml-auto">{{ fmt(loadout.stats.mobility.boost_forward) }}</span>
            </div>
            <div class="px-3 py-1.5 border-t border-sv-border/10 flex items-center gap-2 text-[10px]">
              <span class="text-sm">🔥</span>
              <span class="text-sv-text-bright font-medium">Maneuver</span>
              <span class="text-sv-muted text-[8px]">pitch {{ fmt(loadout.stats.mobility.pitch) }}°/s</span>
            </div>
            <div class="px-3 py-1.5 border-t border-sv-border/10 flex items-center gap-2 text-[10px]">
              <span class="text-sm">🔥</span>
              <span class="text-sv-text-bright font-medium">Retro</span>
              <span class="text-sv-muted text-[8px]">backward</span>
              <span class="text-amber-400 font-mono ml-auto">{{ fmt(loadout.stats.mobility.boost_backward) }}</span>
            </div>
          </div>
        </div>

      </div>

      <!-- Empty state -->
      <div v-else class="card p-16 text-center">
        <div class="text-5xl mb-4 opacity-30">🎯</div>
        <h2 class="text-sv-text-bright font-semibold text-lg mb-2">Loadout Manager</h2>
        <p class="text-sv-muted text-sm max-w-md mx-auto">
          Sélectionnez un vaisseau pour visualiser et modifier son loadout.<br/>
          Cliquez sur un slot pour changer de composant.
        </p>
      </div>
    </LoadingState>

  </div>
</template>
