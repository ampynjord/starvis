<script setup lang="ts">
import LoadingState from '@/components/LoadingState.vue'
import { calculateLoadout, getComponents, getShips, type Component, type Hardpoint, type HardpointComponent, type HardpointSubItem, type LoadoutStats, type Ship } from '@/services/api'
import { HARDPOINT_CATEGORIES, MOUNT_TYPE_LABELS } from '@/utils/constants'
import { debounce, fmt, pct, portLabel, useClickOutside } from '@/utils/formatters'
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

// ── Component selector (inline panel) ──
const selectorTarget = ref<{
  portId: number; portName: string; type: string; maxSize: number
  current: Record<string, unknown> | null
  anchorCategory: string
} | null>(null)
const selectorQuery = ref('')
const selectorResults = ref<Component[]>([])
const selectorLoading = ref(false)
const selectorInputRef = ref<HTMLInputElement | null>(null)

// Click-outside for ship search
const shipSearchRef = ref<HTMLElement | null>(null)
useClickOutside(shipSearchRef, () => { shipResults.value = [] })

// ── Section collapse ──
const collapsedSections = ref<Set<string>>(new Set())
function toggleSection(key: string) {
  if (collapsedSections.value.has(key)) collapsedSections.value.delete(key)
  else collapsedSections.value.add(key)
}

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
  loading.value = true
  error.value = ''
  try {
    const res = await calculateLoadout(uuid, swaps.value)
    loadout.value = res.data
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Erreur loadout'
  } finally {
    loading.value = false
  }
}

// ── Grouped hardpoints by category ──
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

// ── Mount type logic ──
function getMountType(hp: Hardpoint): string | null {
  return mountOverrides.value[hp.port_id] || hp.mount_type
}
function cycleMountType(hp: Hardpoint) {
  const cur = getMountType(hp)
  mountOverrides.value[hp.port_id] = cur === 'Gimbal' ? 'Fixed' : 'Gimbal'
}
function isMountOverridden(hp: Hardpoint): boolean {
  return !!mountOverrides.value[hp.port_id] && mountOverrides.value[hp.port_id] !== hp.mount_type
}
function resetMount(hp: Hardpoint) {
  delete mountOverrides.value[hp.port_id]
}

// ── Selector ──
function openSelector(portId: number, portName: string, type: string, maxSize: number, current: Record<string, unknown> | null, category: string) {
  selectorTarget.value = { portId, portName, type, maxSize, current, anchorCategory: category }
  selectorQuery.value = ''
  selectorResults.value = []
  loadSelectorResults('')
  nextTick(() => { selectorInputRef.value?.focus() })
}
function closeSelector() {
  selectorTarget.value = null
  selectorQuery.value = ''
  selectorResults.value = []
}
async function loadSelectorResults(q: string) {
  if (!selectorTarget.value) return
  selectorLoading.value = true
  try {
    const params: Record<string, string> = { limit: '30' }
    if (selectorTarget.value.type) params.type = selectorTarget.value.type
    if (selectorTarget.value.maxSize > 0) params.max_size = String(selectorTarget.value.maxSize)
    if (q.length >= 1) params.search = q
    const res = await getComponents(params)
    selectorResults.value = res.data
  } finally {
    selectorLoading.value = false
  }
}
const debouncedSelectorSearch = debounce((q: string) => loadSelectorResults(q), 250)

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
async function resetAll() {
  if (!selectedShip.value) return
  swaps.value = []
  mountOverrides.value = {}
  closeSelector()
  await fetchLoadout(selectedShip.value.uuid)
}

// ── Helpers ──
function swapTypeForHp(hp: Hardpoint, comp: HardpointComponent | null): string {
  if (comp?.type) return comp.type
  const map: Record<string, string> = {
    'Weapons': 'WeaponGun', 'Turrets': 'WeaponGun', 'Missiles': 'Missile', 'Shields': 'Shield',
    'Power Plants': 'PowerPlant', 'Coolers': 'Cooler', 'Quantum Drive': 'QuantumDrive',
    'Radar': 'Radar', 'Countermeasures': 'Countermeasure', 'EMP': 'EMP',
    'QED': 'QuantumInterdictionGenerator',
  }
  return map[hp.category] || ''
}
function swapMaxSize(hp: Hardpoint, comp: HardpointComponent | null): number {
  if (comp?.port_max_size && comp.port_max_size > 0) return comp.port_max_size
  const mt = getMountType(hp)
  const base = hp.port_max_size || hp.mount_size || 0
  if (mt === 'Fixed') return base
  if (mt === 'Gimbal') return Math.max(base - 1, 1)
  if (hp.port_max_size && hp.port_max_size > 0) return hp.port_max_size
  if (hp.mount_size && hp.mount_size > 0) return hp.mount_size
  if (comp?.size && comp.size > 0) return comp.size
  return 0
}
function subMaxSize(hp: Hardpoint, _item: HardpointComponent, sub: HardpointSubItem): number {
  if (sub.port_max_size && sub.port_max_size > 0) return sub.port_max_size
  if (sub.size && sub.size > 0) return sub.size
  return hp.mount_size || 0
}

// Delta formatting for selector
function delta(candidate: Record<string, unknown>, field: string): string {
  if (!selectorTarget.value?.current) return ''
  const o = parseFloat(String(selectorTarget.value.current[field])) || 0
  const n = parseFloat(String(candidate[field])) || 0
  const d = n - o
  if (Math.abs(d) < 0.01) return ''
  return (d > 0 ? '+' : '') + fmt(d, 1)
}
function deltaClass(candidate: Record<string, unknown>, field: string, higherBetter = true): string {
  if (!selectorTarget.value?.current) return ''
  const o = parseFloat(String(selectorTarget.value.current[field])) || 0
  const n = parseFloat(String(candidate[field])) || 0
  const d = n - o
  if (Math.abs(d) < 0.01) return 'text-sv-muted'
  return (higherBetter ? d > 0 : d < 0) ? 'text-green-400' : 'text-red-400'
}

// ── Slot click handler ──
function clickSlot(hp: Hardpoint, item: HardpointComponent) {
  if (!item.uuid) return
  openSelector(item.port_id, item.port_name, swapTypeForHp(hp, item), swapMaxSize(hp, item), item as Record<string, unknown>, hp.category)
}
function clickDirectSlot(hp: Hardpoint) {
  if (!hp.component) return
  openSelector(hp.component.port_id, hp.component.port_name, swapTypeForHp(hp, hp.component), swapMaxSize(hp, hp.component), hp.component as Record<string, unknown>, hp.category)
}
function clickSubSlot(hp: Hardpoint, item: HardpointComponent, sub: HardpointSubItem) {
  if (!sub.uuid) return
  openSelector(sub.port_id, sub.port_name, sub.type || 'WeaponGun', subMaxSize(hp, item, sub), sub as unknown as Record<string, unknown>, hp.category)
}

// ── URL persistence ──
function encodeSwaps(): string {
  return swaps.value.map(s => `${s.portId}:${s.componentUuid}`).join(',')
}
function encodeMounts(): string {
  return Object.entries(mountOverrides.value).map(([id, t]) => `${id}:${t}`).join(',')
}
function decodeSwaps(s: string): { portId: number; componentUuid: string }[] {
  if (!s) return []
  return s.split(',').map(p => {
    const [id, uuid] = p.split(':')
    return { portId: parseInt(id), componentUuid: uuid }
  }).filter(x => !isNaN(x.portId) && x.componentUuid)
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
    const res = await calculateLoadout(uuid, swaps.value)
    loadout.value = res.data
    if (res.data?.ship) {
      selectedShip.value = { uuid: res.data.ship.uuid, name: res.data.ship.name } as Ship
      shipQuery.value = res.data.ship.name
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Erreur loadout'
  } finally {
    loading.value = false
  }
})

// ── Color helpers ──
const catBg: Record<string, string> = {
  red: 'bg-red-500/5', blue: 'bg-blue-500/5', orange: 'bg-orange-500/5', yellow: 'bg-yellow-500/5',
  cyan: 'bg-cyan-500/5', purple: 'bg-purple-500/5', green: 'bg-green-500/5', emerald: 'bg-emerald-500/5',
  amber: 'bg-amber-500/5', lime: 'bg-lime-500/5', sky: 'bg-sky-500/5', teal: 'bg-teal-500/5',
}
const catText: Record<string, string> = {
  red: 'text-red-400', blue: 'text-blue-400', orange: 'text-orange-400', yellow: 'text-yellow-400',
  cyan: 'text-cyan-400', purple: 'text-purple-400', green: 'text-green-400', emerald: 'text-emerald-400',
  amber: 'text-amber-400', lime: 'text-lime-400', sky: 'text-sky-400', teal: 'text-teal-400',
}
const catBorder: Record<string, string> = {
  red: 'border-red-500/20', blue: 'border-blue-500/20', orange: 'border-orange-500/20', yellow: 'border-yellow-500/20',
  cyan: 'border-cyan-500/20', purple: 'border-purple-500/20', green: 'border-green-500/20', emerald: 'border-emerald-500/20',
  amber: 'border-amber-500/20', lime: 'border-lime-500/20', sky: 'border-sky-500/20', teal: 'border-teal-500/20',
}

const totalMods = computed(() => swaps.value.length + Object.keys(mountOverrides.value).filter(k => mountOverrides.value[Number(k)] !== undefined).length)
</script>

<template>
  <div class="space-y-3">

    <!-- Ship Picker -->
    <div class="card p-3 relative z-20" ref="shipSearchRef">
      <div class="flex items-center gap-3">
        <div class="flex-1 relative">
          <div class="flex items-center gap-2 mb-1">
            <h1 class="text-xs font-bold text-sv-text-bright uppercase tracking-widest">Loadout Manager</h1>
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
          ↺ Reset ({{ totalMods }})
        </button>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="card border-red-500/50 p-3 text-red-400 text-sm">{{ error }}</div>

    <!-- Main Content -->
    <LoadingState :loading="loading">
      <div v-if="loadout" class="grid grid-cols-1 lg:grid-cols-12 gap-3">

        <!-- LEFT: Slots -->
        <div class="lg:col-span-7 xl:col-span-8 space-y-2">

          <!-- Ship summary -->
          <div class="card px-4 py-3 flex items-center justify-between">
            <div>
              <h2 class="text-base font-bold text-sv-text-bright">{{ loadout.ship.name }}</h2>
              <div class="text-[10px] text-sv-muted font-mono">{{ loadout.ship.class_name }}</div>
            </div>
            <div class="flex gap-4 text-center">
              <div><div class="text-[9px] text-sv-muted uppercase">HP</div><div class="text-sm font-bold text-emerald-400 font-mono">{{ fmt(loadout.stats.hull.total_hp) }}</div></div>
              <div><div class="text-[9px] text-sv-muted uppercase">Shield</div><div class="text-sm font-bold text-blue-400 font-mono">{{ fmt(loadout.stats.shields.total_hp) }}</div></div>
              <div><div class="text-[9px] text-sv-muted uppercase">DPS</div><div class="text-sm font-bold text-red-400 font-mono">{{ fmt(loadout.stats.weapons.total_dps) }}</div></div>
              <div><div class="text-[9px] text-sv-muted uppercase">SCM</div><div class="text-sm font-bold text-sv-accent font-mono">{{ fmt(loadout.stats.mobility.scm_speed) }}</div></div>
              <div class="hidden sm:block"><div class="text-[9px] text-sv-muted uppercase">Mass</div><div class="text-sm font-bold text-sv-text font-mono">{{ fmt(loadout.stats.mobility.mass) }}</div></div>
            </div>
          </div>

          <!-- Category groups -->
          <div v-for="group in groupedHardpoints" :key="group.category" class="card overflow-hidden">
            <!-- Category header -->
            <button @click="toggleSection(group.category)"
              class="w-full flex items-center justify-between px-3 py-2 transition-colors hover:bg-sv-panel-light/20"
              :class="catBg[group.color] || ''">
              <div class="flex items-center gap-2">
                <span class="text-sm">{{ group.icon }}</span>
                <span class="text-[11px] font-bold uppercase tracking-wider" :class="catText[group.color] || ''">{{ group.label }}</span>
                <span class="text-[10px] text-sv-muted bg-sv-darker/50 px-1.5 py-0.5 rounded">{{ group.totalCount }}</span>
              </div>
              <svg class="w-3.5 h-3.5 text-sv-muted transition-transform" :class="{ 'rotate-180': !collapsedSections.has(group.category) }" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>

            <!-- Hardpoints -->
            <div v-if="!collapsedSections.has(group.category)">
              <div v-for="hp in group.items" :key="hp.port_id" class="border-t" :class="catBorder[group.color] || 'border-sv-border/20'">

                <!-- Hierarchical: mount → items -->
                <template v-if="hp.items.length > 0">
                  <!-- Mount header row -->
                  <div class="px-3 py-1.5 bg-sv-darker/30 flex items-center gap-2 text-[10px]">
                    <span class="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold bg-sv-darker/80 border border-sv-border/30"
                      :class="catText[group.color] || 'text-sv-muted'">
                      S{{ hp.port_max_size || hp.mount_size || '?' }}
                    </span>
                    <template v-if="hp.mount_type === 'Gimbal' || hp.mount_type === 'Fixed' || getMountType(hp) === 'Gimbal' || getMountType(hp) === 'Fixed'">
                      <button @click="cycleMountType(hp)"
                        class="text-[8px] px-1.5 py-0.5 rounded font-bold cursor-pointer transition-all hover:brightness-125"
                        :class="[
                          MOUNT_TYPE_LABELS[getMountType(hp) || '']?.badge || 'bg-gray-500/20 text-gray-400',
                          isMountOverridden(hp) ? 'ring-1 ring-amber-400/60' : ''
                        ]"
                        :title="getMountType(hp) === 'Gimbal' ? 'Passer en Fixed (taille arme +1)' : 'Passer en Gimbal (taille arme -1)'">
                        {{ getMountType(hp) === 'Gimbal' ? 'GBL' : 'FXD' }}
                      </button>
                      <button v-if="isMountOverridden(hp)" @click.stop="resetMount(hp)"
                        class="text-[9px] text-amber-400 hover:text-red-400 transition" title="Rétablir">✕</button>
                    </template>
                    <span v-else-if="hp.mount_type" class="text-[8px] px-1.5 py-0.5 rounded font-bold"
                      :class="MOUNT_TYPE_LABELS[hp.mount_type]?.badge || 'bg-gray-500/20 text-gray-400'">
                      {{ MOUNT_TYPE_LABELS[hp.mount_type]?.short || hp.mount_type }}
                    </span>
                    <span class="text-sv-muted truncate flex-1">{{ hp.display_name }}</span>
                    <span v-if="isMountOverridden(hp)" class="text-[8px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300">MOD</span>
                  </div>

                  <!-- Weapon/Component items -->
                  <div v-for="item in hp.items" :key="item.port_id"
                    class="flex items-center gap-2 px-3 py-1.5 pl-7 cursor-pointer transition-colors group/slot"
                    :class="[
                      selectorTarget?.portId === item.port_id ? 'bg-sv-accent/10 ring-1 ring-inset ring-sv-accent/30' : 'hover:bg-sv-panel-light/20',
                      item.swapped ? 'bg-amber-500/5' : ''
                    ]"
                    @click="clickSlot(hp, item)">
                    <div class="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
                      :class="item.swapped ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-sv-darker/60 text-sv-muted border border-sv-border/30'">
                      S{{ item.size || '?' }}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span class="text-xs font-medium truncate" :class="item.swapped ? 'text-amber-300' : 'text-sv-text-bright'">
                          {{ item.display_name || item.name || 'Vide' }}
                        </span>
                        <span v-if="item.grade" class="text-[8px] px-1 py-0.5 rounded bg-sv-darker/50 text-sv-muted border border-sv-border/20">{{ item.grade }}</span>
                        <span v-if="item.swapped" class="text-[8px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300">SWAP</span>
                      </div>
                      <div v-if="item.sub_items?.length" class="mt-0.5 space-y-0.5">
                        <div v-for="sub in item.sub_items" :key="sub.port_id"
                          class="text-[10px] flex items-center gap-1 ml-1 py-0.5 px-1 -mx-1 rounded cursor-pointer transition-colors group/sub"
                          :class="selectorTarget?.portId === sub.port_id ? 'bg-sv-accent/10 ring-1 ring-inset ring-sv-accent/20' : 'hover:bg-sv-panel-light/10'"
                          @click.stop="clickSubSlot(hp, item, sub)">
                          <span class="text-sv-border">└</span>
                          <span class="font-mono text-[9px] text-sv-muted">S{{ sub.size || '?' }}</span>
                          <span class="flex-1 truncate" :class="sub.swapped ? 'text-amber-300' : 'text-sv-text'">{{ sub.display_name || sub.name || 'Vide' }}</span>
                          <span v-if="sub.weapon_dps" class="text-red-400 font-mono text-[9px]">{{ fmt(sub.weapon_dps, 0) }} DPS</span>
                          <span v-if="sub.missile_damage" class="text-orange-400 font-mono text-[9px]">{{ fmt(sub.missile_damage, 0) }} dmg</span>
                          <span v-if="sub.swapped" class="text-[7px] px-0.5 rounded bg-amber-500/15 text-amber-300">SWAP</span>
                          <button v-if="sub.swapped" @click.stop="removeSwap(sub.port_id)"
                            class="opacity-0 group-hover/sub:opacity-100 p-0.5 rounded hover:bg-red-500/10 text-sv-muted hover:text-red-400 transition" title="Rétablir">
                            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                    <div class="hidden sm:flex items-center gap-2 text-[10px] text-sv-muted font-mono shrink-0">
                      <template v-if="item.weapon_dps"><span class="text-red-400">{{ fmt(item.weapon_dps, 0) }} DPS</span></template>
                      <template v-if="item.missile_damage"><span class="text-orange-400">{{ fmt(item.missile_damage, 0) }} dmg</span></template>
                      <template v-if="item.shield_hp"><span class="text-blue-400">{{ fmt(item.shield_hp, 0) }} HP</span></template>
                    </div>
                    <button v-if="item.swapped" @click.stop="removeSwap(item.port_id)"
                      class="opacity-0 group-hover/slot:opacity-100 p-1 rounded hover:bg-red-500/10 text-sv-muted hover:text-red-400 transition shrink-0" title="Rétablir">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  <!-- Inline selector panel for hierarchical items -->
                  <div v-if="selectorTarget && selectorTarget.anchorCategory === group.category && hp.items.some(i => i.port_id === selectorTarget!.portId || (i.sub_items || []).some(s => s.port_id === selectorTarget!.portId))"
                    class="border-t border-sv-accent/20 bg-sv-darker/40">
                    <div class="px-3 py-2 flex items-center gap-2 border-b border-sv-border/20">
                      <span class="text-[10px] text-sv-muted">Remplacer :</span>
                      <span class="text-[10px] text-sv-text-bright">{{ selectorTarget.current?.display_name || selectorTarget.current?.name || '—' }}</span>
                      <span class="text-[9px] text-sv-accent">({{ selectorTarget.type }} ≤ S{{ selectorTarget.maxSize }})</span>
                      <div class="flex-1"></div>
                      <button @click="closeSelector" class="text-[10px] text-sv-muted hover:text-sv-text transition">✕ Fermer</button>
                    </div>
                    <div class="px-3 py-1.5">
                      <input ref="selectorInputRef" v-model="selectorQuery" @input="debouncedSelectorSearch(selectorQuery)"
                        class="input w-full text-xs py-1.5" placeholder="Filtrer les composants…" />
                    </div>
                    <div class="max-h-56 overflow-y-auto">
                      <div v-if="selectorLoading" class="px-3 py-4 text-center text-sv-muted text-[10px]">Chargement…</div>
                      <template v-else-if="selectorResults.length">
                        <div v-for="c in selectorResults" :key="c.uuid" @click="applySwap(c)"
                          class="px-3 py-1.5 hover:bg-sv-accent/10 cursor-pointer transition-colors flex items-center justify-between text-xs border-b border-sv-border/10 last:border-0">
                          <div class="min-w-0">
                            <div class="text-sv-text-bright font-medium truncate">{{ c.name }}</div>
                            <div class="text-[9px] text-sv-muted flex gap-1.5 mt-0.5">
                              <span>S{{ c.size }}</span>
                              <span v-if="c.grade">Gr. {{ c.grade }}</span>
                              <span v-if="c.manufacturer_code">{{ c.manufacturer_code }}</span>
                            </div>
                          </div>
                          <div class="text-[10px] font-mono text-right space-y-0.5 shrink-0 ml-2">
                            <div v-if="c.weapon_dps" class="text-red-400">{{ fmt(c.weapon_dps) }} DPS<span v-if="delta(c, 'weapon_dps')" :class="deltaClass(c, 'weapon_dps')"> ({{ delta(c, 'weapon_dps') }})</span></div>
                            <div v-if="c.shield_hp" class="text-blue-400">{{ fmt(c.shield_hp) }} HP<span v-if="delta(c, 'shield_hp')" :class="deltaClass(c, 'shield_hp')"> ({{ delta(c, 'shield_hp') }})</span></div>
                            <div v-if="c.power_output" class="text-yellow-400">{{ fmt(c.power_output) }}<span v-if="delta(c, 'power_output')" :class="deltaClass(c, 'power_output')"> ({{ delta(c, 'power_output') }})</span></div>
                            <div v-if="c.cooling_rate" class="text-cyan-400">{{ fmt(c.cooling_rate) }}<span v-if="delta(c, 'cooling_rate')" :class="deltaClass(c, 'cooling_rate')"> ({{ delta(c, 'cooling_rate') }})</span></div>
                            <div v-if="c.qd_speed" class="text-purple-400">{{ fmt(c.qd_speed) }} m/s<span v-if="delta(c, 'qd_speed')" :class="deltaClass(c, 'qd_speed')"> ({{ delta(c, 'qd_speed') }})</span></div>
                            <div v-if="c.missile_damage" class="text-orange-400">{{ fmt(c.missile_damage) }} dmg<span v-if="delta(c, 'missile_damage')" :class="deltaClass(c, 'missile_damage')"> ({{ delta(c, 'missile_damage') }})</span></div>
                          </div>
                        </div>
                      </template>
                      <div v-else class="px-3 py-4 text-center text-sv-muted text-[10px]">Aucun composant trouvé</div>
                    </div>
                  </div>
                </template>

                <!-- Direct component (shield, PP, cooler, QD, etc.) -->
                <template v-else-if="hp.component">
                  <div class="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors group/slot"
                    :class="[
                      selectorTarget?.portId === hp.component.port_id ? 'bg-sv-accent/10 ring-1 ring-inset ring-sv-accent/30' : 'hover:bg-sv-panel-light/20',
                      hp.component.swapped ? 'bg-amber-500/5' : ''
                    ]"
                    @click="clickDirectSlot(hp)">
                    <div class="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
                      :class="hp.component.swapped ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-sv-darker/60 text-sv-muted border border-sv-border/30'">
                      S{{ hp.component.size || '?' }}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span class="text-xs font-medium truncate" :class="hp.component.swapped ? 'text-amber-300' : 'text-sv-text-bright'">
                          {{ hp.component.display_name || hp.component.name || 'Vide' }}
                        </span>
                        <span v-if="hp.component.grade" class="text-[8px] px-1 py-0.5 rounded bg-sv-darker/50 text-sv-muted border border-sv-border/20">{{ hp.component.grade }}</span>
                        <span v-if="hp.component.swapped" class="text-[8px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300">SWAP</span>
                      </div>
                      <div class="text-[10px] text-sv-muted truncate">{{ hp.display_name }}</div>
                    </div>
                    <div class="hidden sm:flex items-center gap-2 text-[10px] text-sv-muted font-mono shrink-0">
                      <template v-if="hp.component.weapon_dps"><span class="text-red-400">{{ fmt(hp.component.weapon_dps, 0) }} DPS</span></template>
                      <template v-if="hp.component.shield_hp"><span class="text-blue-400">{{ fmt(hp.component.shield_hp, 0) }} HP</span><span class="text-blue-300"> {{ fmt(hp.component.shield_regen, 0) }}/s</span></template>
                      <template v-if="hp.component.power_output"><span class="text-yellow-400">{{ fmt(hp.component.power_output, 0) }}</span></template>
                      <template v-if="hp.component.cooling_rate"><span class="text-cyan-400">{{ fmt(hp.component.cooling_rate, 0) }}</span></template>
                      <template v-if="hp.component.qd_speed"><span class="text-purple-400">{{ fmt(hp.component.qd_speed) }} m/s</span></template>
                      <template v-if="hp.component.cm_ammo"><span class="text-emerald-400">{{ hp.component.cm_ammo }}</span></template>
                      <template v-if="hp.component.radar_range"><span class="text-green-400">{{ fmt(hp.component.radar_range, 0) }}m</span></template>
                      <template v-if="hp.component.emp_damage"><span class="text-purple-400">{{ fmt(hp.component.emp_damage, 0) }} dmg</span></template>
                    </div>
                    <button v-if="hp.component.swapped" @click.stop="removeSwap(hp.component.port_id)"
                      class="opacity-0 group-hover/slot:opacity-100 p-1 rounded hover:bg-red-500/10 text-sv-muted hover:text-red-400 transition shrink-0" title="Rétablir">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  <!-- Inline selector for direct component -->
                  <div v-if="selectorTarget && selectorTarget.portId === hp.component.port_id"
                    class="border-t border-sv-accent/20 bg-sv-darker/40">
                    <div class="px-3 py-2 flex items-center gap-2 border-b border-sv-border/20">
                      <span class="text-[10px] text-sv-muted">Remplacer :</span>
                      <span class="text-[10px] text-sv-text-bright">{{ selectorTarget.current?.display_name || selectorTarget.current?.name || '—' }}</span>
                      <span class="text-[9px] text-sv-accent">({{ selectorTarget.type }} ≤ S{{ selectorTarget.maxSize }})</span>
                      <div class="flex-1"></div>
                      <button @click="closeSelector" class="text-[10px] text-sv-muted hover:text-sv-text transition">✕ Fermer</button>
                    </div>
                    <div class="px-3 py-1.5">
                      <input ref="selectorInputRef" v-model="selectorQuery" @input="debouncedSelectorSearch(selectorQuery)"
                        class="input w-full text-xs py-1.5" placeholder="Filtrer les composants…" />
                    </div>
                    <div class="max-h-56 overflow-y-auto">
                      <div v-if="selectorLoading" class="px-3 py-4 text-center text-sv-muted text-[10px]">Chargement…</div>
                      <template v-else-if="selectorResults.length">
                        <div v-for="c in selectorResults" :key="c.uuid" @click="applySwap(c)"
                          class="px-3 py-1.5 hover:bg-sv-accent/10 cursor-pointer transition-colors flex items-center justify-between text-xs border-b border-sv-border/10 last:border-0">
                          <div class="min-w-0">
                            <div class="text-sv-text-bright font-medium truncate">{{ c.name }}</div>
                            <div class="text-[9px] text-sv-muted flex gap-1.5 mt-0.5">
                              <span>S{{ c.size }}</span>
                              <span v-if="c.grade">Gr. {{ c.grade }}</span>
                              <span v-if="c.manufacturer_code">{{ c.manufacturer_code }}</span>
                            </div>
                          </div>
                          <div class="text-[10px] font-mono text-right space-y-0.5 shrink-0 ml-2">
                            <div v-if="c.weapon_dps" class="text-red-400">{{ fmt(c.weapon_dps) }} DPS<span v-if="delta(c, 'weapon_dps')" :class="deltaClass(c, 'weapon_dps')"> ({{ delta(c, 'weapon_dps') }})</span></div>
                            <div v-if="c.shield_hp" class="text-blue-400">{{ fmt(c.shield_hp) }} HP<span v-if="delta(c, 'shield_hp')" :class="deltaClass(c, 'shield_hp')"> ({{ delta(c, 'shield_hp') }})</span></div>
                            <div v-if="c.power_output" class="text-yellow-400">{{ fmt(c.power_output) }}<span v-if="delta(c, 'power_output')" :class="deltaClass(c, 'power_output')"> ({{ delta(c, 'power_output') }})</span></div>
                            <div v-if="c.cooling_rate" class="text-cyan-400">{{ fmt(c.cooling_rate) }}<span v-if="delta(c, 'cooling_rate')" :class="deltaClass(c, 'cooling_rate')"> ({{ delta(c, 'cooling_rate') }})</span></div>
                            <div v-if="c.qd_speed" class="text-purple-400">{{ fmt(c.qd_speed) }} m/s<span v-if="delta(c, 'qd_speed')" :class="deltaClass(c, 'qd_speed')"> ({{ delta(c, 'qd_speed') }})</span></div>
                            <div v-if="c.missile_damage" class="text-orange-400">{{ fmt(c.missile_damage) }} dmg<span v-if="delta(c, 'missile_damage')" :class="deltaClass(c, 'missile_damage')"> ({{ delta(c, 'missile_damage') }})</span></div>
                          </div>
                        </div>
                      </template>
                      <div v-else class="px-3 py-4 text-center text-sv-muted text-[10px]">Aucun composant trouvé</div>
                    </div>
                  </div>
                </template>

              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT: Stats -->
        <div class="lg:col-span-5 xl:col-span-4 space-y-2 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto scrollbar-thin">

          <!-- Weapons -->
          <div class="card overflow-hidden">
            <div class="px-3 py-1.5 bg-red-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-red-400 uppercase tracking-wider">🔫 Weapons</span>
            </div>
            <div class="p-3 space-y-2">
              <div class="grid grid-cols-3 gap-2 text-center">
                <div><div class="text-[9px] text-sv-muted uppercase">DPS</div><div class="text-sm font-bold text-red-400 font-mono">{{ fmt(loadout.stats.weapons.total_dps) }}</div></div>
                <div><div class="text-[9px] text-sv-muted uppercase">Burst</div><div class="text-sm font-bold text-red-300 font-mono">{{ fmt(loadout.stats.weapons.total_burst_dps) }}</div></div>
                <div><div class="text-[9px] text-sv-muted uppercase">Sustained</div><div class="text-sm font-bold text-red-200 font-mono">{{ fmt(loadout.stats.weapons.total_sustained_dps) }}</div></div>
              </div>
              <table v-if="loadout.stats.weapons.details?.length" class="w-full text-[10px] mt-1">
                <thead><tr class="text-sv-muted border-b border-sv-border/20"><th class="text-left py-1 font-medium">Name</th><th class="text-center py-1 font-medium">S</th><th class="text-right py-1 font-medium">DPS</th><th class="text-right py-1 font-medium hidden sm:table-cell">Range</th></tr></thead>
                <tbody><tr v-for="(w, i) in loadout.stats.weapons.details" :key="i" class="border-b border-sv-border/10"><td class="py-1 text-sv-text-bright truncate max-w-[120px]">{{ w.name }}</td><td class="py-1 text-center text-sv-muted">{{ w.size }}</td><td class="py-1 text-right text-red-400 font-mono">{{ fmt(w.dps) }}</td><td class="py-1 text-right text-sv-muted font-mono hidden sm:table-cell">{{ fmt(w.range) }}m</td></tr></tbody>
              </table>
            </div>
          </div>

          <!-- Shields -->
          <div class="card overflow-hidden">
            <div class="px-3 py-1.5 bg-blue-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-blue-400 uppercase tracking-wider">🛡️ Shields</span>
            </div>
            <div class="p-3 space-y-2">
              <div class="grid grid-cols-3 gap-2 text-center">
                <div><div class="text-[9px] text-sv-muted uppercase">Total HP</div><div class="text-sm font-bold text-blue-400 font-mono">{{ fmt(loadout.stats.shields.total_hp) }}</div></div>
                <div><div class="text-[9px] text-sv-muted uppercase">Regen</div><div class="text-sm font-bold text-blue-300 font-mono">{{ fmt(loadout.stats.shields.total_regen) }}/s</div></div>
                <div><div class="text-[9px] text-sv-muted uppercase">Charge</div><div class="text-sm font-bold text-blue-200 font-mono">{{ loadout.stats.shields.time_to_charge || '—' }}s</div></div>
              </div>
              <table v-if="loadout.stats.shields.details?.length" class="w-full text-[10px] mt-1">
                <thead><tr class="text-sv-muted border-b border-sv-border/20"><th class="text-left py-1 font-medium">Name</th><th class="text-center py-1 font-medium">S</th><th class="text-right py-1 font-medium">HP</th><th class="text-right py-1 font-medium">Regen</th></tr></thead>
                <tbody><tr v-for="(s, i) in loadout.stats.shields.details" :key="i" class="border-b border-sv-border/10"><td class="py-1 text-sv-text-bright truncate max-w-[120px]">{{ s.name }}</td><td class="py-1 text-center text-sv-muted">{{ s.size }}</td><td class="py-1 text-right text-blue-400 font-mono">{{ fmt(s.hp) }}</td><td class="py-1 text-right text-blue-300 font-mono">{{ fmt(s.regen) }}/s</td></tr></tbody>
              </table>
            </div>
          </div>

          <!-- Missiles -->
          <div class="card overflow-hidden">
            <div class="px-3 py-1.5 bg-orange-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-orange-400 uppercase tracking-wider">🚀 Missiles</span>
            </div>
            <div class="p-3">
              <div class="grid grid-cols-2 gap-2 text-center">
                <div><div class="text-[9px] text-sv-muted uppercase">Count</div><div class="text-sm font-bold text-orange-400 font-mono">{{ loadout.stats.missiles.count }}</div></div>
                <div><div class="text-[9px] text-sv-muted uppercase">Total Damage</div><div class="text-sm font-bold text-orange-300 font-mono">{{ fmt(loadout.stats.missiles.total_damage) }}</div></div>
              </div>
              <table v-if="loadout.stats.missiles.details?.length" class="w-full text-[10px] mt-1">
                <thead><tr class="text-sv-muted border-b border-sv-border/20"><th class="text-left py-1 font-medium">Name</th><th class="text-center py-1 font-medium">S</th><th class="text-right py-1 font-medium">Dmg</th><th class="text-right py-1 font-medium hidden sm:table-cell">Speed</th></tr></thead>
                <tbody><tr v-for="(m, i) in loadout.stats.missiles.details" :key="i" class="border-b border-sv-border/10"><td class="py-1 text-sv-text-bright truncate max-w-[100px]">{{ m.name }}</td><td class="py-1 text-center text-sv-muted">{{ m.size }}</td><td class="py-1 text-right text-orange-400 font-mono">{{ fmt(m.damage) }}</td><td class="py-1 text-right text-sv-muted font-mono hidden sm:table-cell">{{ m.speed ? fmt(m.speed, 0) + ' m/s' : '—' }}</td></tr></tbody>
              </table>
            </div>
          </div>

          <!-- Countermeasures -->
          <div v-if="loadout.stats.countermeasures" class="card overflow-hidden">
            <div class="px-3 py-1.5 bg-emerald-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">🎯 Countermeasures</span>
            </div>
            <div class="p-3">
              <div class="grid grid-cols-2 gap-2 text-center">
                <div><div class="text-[9px] text-sv-muted uppercase">Flares</div><div class="text-sm font-bold text-emerald-400 font-mono">{{ loadout.stats.countermeasures.flare_count }}</div></div>
                <div><div class="text-[9px] text-sv-muted uppercase">Chaff</div><div class="text-sm font-bold text-emerald-300 font-mono">{{ loadout.stats.countermeasures.chaff_count }}</div></div>
              </div>
            </div>
          </div>

          <!-- Hull -->
          <div class="card overflow-hidden">
            <div class="px-3 py-1.5 bg-emerald-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">💚 Hull & Armor</span>
            </div>
            <div class="p-3 space-y-2">
              <div class="grid grid-cols-2 gap-2 text-center">
                <div><div class="text-[9px] text-sv-muted uppercase">Hull HP</div><div class="text-sm font-bold text-emerald-400 font-mono">{{ fmt(loadout.stats.hull.total_hp) }}</div></div>
                <div><div class="text-[9px] text-sv-muted uppercase">EHP</div><div class="text-sm font-bold text-emerald-300 font-mono">{{ fmt(loadout.stats.hull.ehp) }}</div></div>
              </div>
              <div v-if="loadout.stats.hull.cross_section_x" class="grid grid-cols-3 gap-2 text-center pt-2 border-t border-sv-border/20">
                <div><div class="text-[9px] text-sv-muted">Length</div><div class="text-[11px] font-mono text-sv-text-bright">{{ fmt(loadout.stats.hull.cross_section_x, 1) }}m</div></div>
                <div><div class="text-[9px] text-sv-muted">Beam</div><div class="text-[11px] font-mono text-sv-text-bright">{{ fmt(loadout.stats.hull.cross_section_y, 1) }}m</div></div>
                <div><div class="text-[9px] text-sv-muted">Height</div><div class="text-[11px] font-mono text-sv-text-bright">{{ fmt(loadout.stats.hull.cross_section_z, 1) }}m</div></div>
              </div>
              <div class="space-y-1">
                <div class="flex items-center justify-between text-[10px]">
                  <span class="text-sv-muted">Physical</span>
                  <div class="flex items-center gap-2"><div class="w-16 h-1.5 bg-sv-darker rounded-full overflow-hidden"><div class="h-full bg-emerald-500 rounded-full" :style="{ width: pct(1 - (loadout.stats.armor.physical || 0)) }"></div></div><span class="text-emerald-400 font-mono w-10 text-right">{{ pct(1 - (loadout.stats.armor.physical || 0)) }}</span></div>
                </div>
                <div class="flex items-center justify-between text-[10px]">
                  <span class="text-sv-muted">Energy</span>
                  <div class="flex items-center gap-2"><div class="w-16 h-1.5 bg-sv-darker rounded-full overflow-hidden"><div class="h-full bg-blue-500 rounded-full" :style="{ width: pct(1 - (loadout.stats.armor.energy || 0)) }"></div></div><span class="text-blue-400 font-mono w-10 text-right">{{ pct(1 - (loadout.stats.armor.energy || 0)) }}</span></div>
                </div>
                <div class="flex items-center justify-between text-[10px]">
                  <span class="text-sv-muted">Distortion</span>
                  <div class="flex items-center gap-2"><div class="w-16 h-1.5 bg-sv-darker rounded-full overflow-hidden"><div class="h-full bg-purple-500 rounded-full" :style="{ width: pct(1 - (loadout.stats.armor.distortion || 0)) }"></div></div><span class="text-purple-400 font-mono w-10 text-right">{{ pct(1 - (loadout.stats.armor.distortion || 0)) }}</span></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Mobility -->
          <div class="card overflow-hidden">
            <div class="px-3 py-1.5 bg-sv-accent/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-sv-accent uppercase tracking-wider">🏎️ Mobility</span>
            </div>
            <div class="p-3">
              <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                <div class="flex justify-between"><span class="text-sv-muted">SCM</span><span class="text-sv-text-bright font-mono">{{ fmt(loadout.stats.mobility.scm_speed) }} m/s</span></div>
                <div class="flex justify-between"><span class="text-sv-muted">Max</span><span class="text-sv-text-bright font-mono">{{ fmt(loadout.stats.mobility.max_speed) }} m/s</span></div>
                <div class="flex justify-between"><span class="text-sv-muted">Pitch</span><span class="text-sv-text-bright font-mono">{{ fmt(loadout.stats.mobility.pitch) }}°/s</span></div>
                <div class="flex justify-between"><span class="text-sv-muted">Yaw</span><span class="text-sv-text-bright font-mono">{{ fmt(loadout.stats.mobility.yaw) }}°/s</span></div>
                <div class="flex justify-between"><span class="text-sv-muted">Roll</span><span class="text-sv-text-bright font-mono">{{ fmt(loadout.stats.mobility.roll) }}°/s</span></div>
                <div class="flex justify-between"><span class="text-sv-muted">Mass</span><span class="text-sv-text-bright font-mono">{{ fmt(loadout.stats.mobility.mass) }} kg</span></div>
              </div>
            </div>
          </div>

          <!-- Quantum -->
          <div class="card overflow-hidden">
            <div class="px-3 py-1.5 bg-purple-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-purple-400 uppercase tracking-wider">💫 Quantum</span>
            </div>
            <div class="p-3">
              <div class="text-xs text-sv-text-bright font-medium mb-1">{{ loadout.stats.quantum.drive_name || '—' }}</div>
              <div class="grid grid-cols-3 gap-2 text-center text-[10px]">
                <div><div class="text-sv-muted">Speed</div><div class="text-purple-400 font-mono font-medium">{{ fmt(loadout.stats.quantum.speed) }} m/s</div></div>
                <div><div class="text-sv-muted">Spool</div><div class="text-purple-300 font-mono font-medium">{{ loadout.stats.quantum.spool_time }}s</div></div>
                <div><div class="text-sv-muted">Fuel</div><div class="text-purple-200 font-mono font-medium">{{ loadout.stats.quantum.fuel_capacity }}L</div></div>
              </div>
            </div>
          </div>

          <!-- Signatures -->
          <div class="card overflow-hidden">
            <div class="px-3 py-1.5 bg-emerald-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">📡 Signatures</span>
            </div>
            <div class="p-3 space-y-1">
              <div class="flex items-center justify-between text-[10px]">
                <span class="text-sv-muted">IR</span>
                <div class="flex items-center gap-2"><div class="w-20 h-1.5 bg-sv-darker rounded-full overflow-hidden"><div class="h-full bg-red-500 rounded-full" :style="{ width: Math.min(100, (loadout.stats.signatures.ir || 0) * 50) + '%' }"></div></div><span class="text-red-400 font-mono w-8 text-right">{{ loadout.stats.signatures.ir?.toFixed(2) || '—' }}</span></div>
              </div>
              <div class="flex items-center justify-between text-[10px]">
                <span class="text-sv-muted">EM</span>
                <div class="flex items-center gap-2"><div class="w-20 h-1.5 bg-sv-darker rounded-full overflow-hidden"><div class="h-full bg-blue-500 rounded-full" :style="{ width: Math.min(100, (loadout.stats.signatures.em || 0) * 50) + '%' }"></div></div><span class="text-blue-400 font-mono w-8 text-right">{{ loadout.stats.signatures.em?.toFixed(2) || '—' }}</span></div>
              </div>
              <div class="flex items-center justify-between text-[10px]">
                <span class="text-sv-muted">CS</span>
                <div class="flex items-center gap-2"><div class="w-20 h-1.5 bg-sv-darker rounded-full overflow-hidden"><div class="h-full bg-amber-500 rounded-full" :style="{ width: Math.min(100, (loadout.stats.signatures.cs || 0) * 50) + '%' }"></div></div><span class="text-amber-400 font-mono w-8 text-right">{{ loadout.stats.signatures.cs?.toFixed(2) || '—' }}</span></div>
              </div>
            </div>
          </div>

          <!-- Power & Thermal -->
          <div class="card overflow-hidden">
            <div class="px-3 py-1.5 bg-yellow-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-yellow-400 uppercase tracking-wider">⚡ Power & Thermal</span>
            </div>
            <div class="p-3 space-y-2">
              <div class="grid grid-cols-2 gap-3 text-center text-[10px]">
                <div><div class="text-sv-muted">Output</div><div class="text-yellow-400 font-mono font-medium text-sm">{{ fmt(loadout.stats.power.total_output) }}</div></div>
                <div><div class="text-sv-muted">Draw</div><div class="text-yellow-300 font-mono font-medium text-sm">{{ fmt(loadout.stats.power.total_draw) }}</div></div>
              </div>
              <div class="flex items-center justify-between text-[10px] px-1">
                <span class="text-sv-muted">Balance</span>
                <span class="font-mono font-medium" :class="loadout.stats.power.balance >= 0 ? 'text-emerald-400' : 'text-red-400'">
                  {{ loadout.stats.power.balance >= 0 ? '+' : '' }}{{ fmt(loadout.stats.power.balance) }}
                </span>
              </div>
              <div class="border-t border-sv-border/20 pt-2 grid grid-cols-2 gap-3 text-center text-[10px]">
                <div><div class="text-sv-muted">Cooling</div><div class="text-cyan-400 font-mono font-medium text-sm">{{ fmt(loadout.stats.thermal.total_cooling_rate) }}</div></div>
                <div><div class="text-sv-muted">Heat Gen.</div><div class="text-cyan-300 font-mono font-medium text-sm">{{ fmt(loadout.stats.thermal.total_heat_generation) }}</div></div>
              </div>
              <div class="flex items-center justify-between text-[10px] px-1">
                <span class="text-sv-muted">Thermal</span>
                <span class="font-mono font-medium" :class="loadout.stats.thermal.balance >= 0 ? 'text-emerald-400' : 'text-red-400'">
                  {{ loadout.stats.thermal.balance >= 0 ? '+' : '' }}{{ fmt(loadout.stats.thermal.balance) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Fuel -->
          <div class="card overflow-hidden">
            <div class="px-3 py-1.5 bg-amber-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-amber-400 uppercase tracking-wider">⛽ Fuel</span>
            </div>
            <div class="p-3">
              <div class="grid grid-cols-2 gap-3 text-center text-[10px]">
                <div><div class="text-sv-muted">Hydrogen</div><div class="text-amber-400 font-mono font-medium text-sm">{{ loadout.stats.fuel.hydrogen }}L</div></div>
                <div><div class="text-sv-muted">Quantum</div><div class="text-amber-300 font-mono font-medium text-sm">{{ loadout.stats.fuel.quantum }}L</div></div>
              </div>
            </div>
          </div>

          <!-- EMP -->
          <div v-if="loadout.stats.emp?.count" class="card overflow-hidden">
            <div class="px-3 py-1.5 bg-purple-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-purple-400 uppercase tracking-wider">⚡ EMP</span>
            </div>
            <div class="p-3">
              <table class="w-full text-[10px]">
                <thead><tr class="text-sv-muted border-b border-sv-border/20"><th class="text-left py-1 font-medium">Name</th><th class="text-right py-1 font-medium">Dmg</th><th class="text-right py-1 font-medium">Radius</th></tr></thead>
                <tbody><tr v-for="(e, i) in loadout.stats.emp.details" :key="i" class="border-b border-sv-border/10"><td class="py-1 text-sv-text-bright truncate max-w-[100px]">{{ e.name }}</td><td class="py-1 text-right text-purple-400 font-mono">{{ fmt(e.damage) }}</td><td class="py-1 text-right text-purple-300 font-mono">{{ fmt(e.radius, 0) }}m</td></tr></tbody>
              </table>
            </div>
          </div>

          <!-- QED -->
          <div v-if="loadout.stats.quantum_interdiction?.count" class="card overflow-hidden">
            <div class="px-3 py-1.5 bg-purple-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-purple-400 uppercase tracking-wider">🔒 QED</span>
            </div>
            <div class="p-3">
              <table class="w-full text-[10px]">
                <thead><tr class="text-sv-muted border-b border-sv-border/20"><th class="text-left py-1 font-medium">Name</th><th class="text-right py-1 font-medium">Jammer</th><th class="text-right py-1 font-medium">Snare</th></tr></thead>
                <tbody><tr v-for="(q, i) in loadout.stats.quantum_interdiction.details" :key="i" class="border-b border-sv-border/10"><td class="py-1 text-sv-text-bright truncate max-w-[100px]">{{ q.name }}</td><td class="py-1 text-right text-purple-400 font-mono">{{ q.jammer_range ? fmt(q.jammer_range, 0) + 'm' : '—' }}</td><td class="py-1 text-right text-purple-300 font-mono">{{ q.snare_radius ? fmt(q.snare_radius, 0) + 'm' : '—' }}</td></tr></tbody>
              </table>
            </div>
          </div>

          <!-- Utility -->
          <div v-if="loadout.stats.utility?.count" class="card overflow-hidden">
            <div class="px-3 py-1.5 bg-amber-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-amber-400 uppercase tracking-wider">⛏️ Utility</span>
            </div>
            <div class="p-3">
              <table class="w-full text-[10px]">
                <thead><tr class="text-sv-muted border-b border-sv-border/20"><th class="text-left py-1 font-medium">Name</th><th class="text-center py-1 font-medium">S</th><th class="text-left py-1 font-medium">Type</th></tr></thead>
                <tbody><tr v-for="(u, i) in loadout.stats.utility.details" :key="i" class="border-b border-sv-border/10"><td class="py-1 text-sv-text-bright truncate max-w-[100px]">{{ u.name }}</td><td class="py-1 text-center text-sv-muted">{{ u.size }}</td><td class="py-1"><span class="text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400">{{ u.utility_type === 'MiningLaser' ? 'Mining' : u.utility_type === 'SalvageHead' ? 'Salvage' : u.utility_type === 'TractorBeam' ? 'Tractor' : 'Repair' }}</span></td></tr></tbody>
              </table>
            </div>
          </div>

          <!-- Modules -->
          <div v-if="loadout.modules?.length" class="card overflow-hidden">
            <div class="px-3 py-1.5 bg-indigo-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">🧩 Modules</span>
            </div>
            <div class="p-3 space-y-0.5">
              <div v-for="(mod, i) in loadout.modules" :key="i" class="flex items-center justify-between text-[10px] px-1">
                <span class="text-sv-text-bright">{{ mod.module_name || mod.name || '—' }}</span>
                <span class="text-sv-muted font-mono">{{ mod.module_type || mod.type || '' }}</span>
              </div>
            </div>
          </div>

          <!-- Paints -->
          <div v-if="loadout.paints?.length" class="card overflow-hidden">
            <div class="px-3 py-1.5 bg-pink-500/5 border-b border-sv-border/30">
              <span class="text-[11px] font-bold text-pink-400 uppercase tracking-wider">🎨 Paints</span>
            </div>
            <div class="p-3 space-y-0.5">
              <div v-for="(paint, i) in loadout.paints" :key="i" class="text-[10px] px-1 text-sv-text-bright">{{ paint.paint_name || paint.paint_class_name || '—' }}</div>
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
