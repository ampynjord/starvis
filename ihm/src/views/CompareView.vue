<script setup lang="ts">
import LoadingState from '@/components/LoadingState.vue'
import { compareShips, getShips, type CompareResult, type Ship } from '@/services/api'
import { debounce, fmt, useClickOutside } from '@/utils/formatters'
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const ship1Query = ref('')
const ship2Query = ref('')
const ship1Results = ref<Ship[]>([])
const ship2Results = ref<Ship[]>([])
const ship1 = ref<string>((route.query.ship1 as string) || '')
const ship2 = ref<string>((route.query.ship2 as string) || '')
const comparison = ref<CompareResult | null>(null)
const loading = ref(false)
const error = ref('')

// Click-outside refs
const dropdown1 = ref<HTMLElement | null>(null)
const dropdown2 = ref<HTMLElement | null>(null)
useClickOutside(dropdown1, () => { ship1Results.value = [] })
useClickOutside(dropdown2, () => { ship2Results.value = [] })

const debouncedSearch1 = debounce((q: string) => searchShips(q, 1), 300)
const debouncedSearch2 = debounce((q: string) => searchShips(q, 2), 300)

async function searchShips(query: string, target: 1 | 2) {
  if (query.length < 2) { target === 1 ? ship1Results.value = [] : ship2Results.value = []; return }
  const res = await getShips({ search: query, limit: '8' })
  if (target === 1) ship1Results.value = res.data
  else ship2Results.value = res.data
}

function selectShip(ship: Ship, target: 1 | 2) {
  if (target === 1) { ship1.value = ship.class_name || ship.uuid; ship1Query.value = ship.name; ship1Results.value = [] }
  else { ship2.value = ship.class_name || ship.uuid; ship2Query.value = ship.name; ship2Results.value = [] }
}

async function doCompare() {
  if (!ship1.value || !ship2.value) return
  loading.value = true
  error.value = ''
  try {
    router.replace({ query: { ship1: ship1.value, ship2: ship2.value } })
    const res = await compareShips(ship1.value, ship2.value)
    comparison.value = res.data || res
    // Populate search inputs from result if still empty
    const c = comparison.value
    if (c?.ship1?.name && !ship1Query.value) ship1Query.value = c.ship1.name
    if (c?.ship2?.name && !ship2Query.value) ship2Query.value = c.ship2.name
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Comparison error'
  } finally {
    loading.value = false
  }
}

watch([ship1, ship2], () => { if (ship1.value && ship2.value) doCompare() }, { immediate: true })

function getVal(ship: Record<string, unknown>, field: string) {
  if (!ship) return null
  const v = parseFloat(String(ship[field]))
  return isNaN(v) ? null : v
}

function getDelta(field: string): number {
  return comparison.value?.comparison?.[field]?.diff ?? 0
}

/** Stats where a lower value is better (armor multipliers, mass, cross-section) */
const LOWER_IS_BETTER = new Set([
  'mass', 'armor_physical', 'armor_energy', 'armor_distortion',
  'cross_section_x', 'cross_section_y', 'cross_section_z',
])

function deltaColor(d: number | null, field: string) {
  if (d == null || d === 0) return ''
  const invert = LOWER_IS_BETTER.has(field)
  const isPositive = invert ? d < 0 : d > 0
  return isPositive ? 'text-emerald-400' : 'text-red-400'
}

function deltaIcon(d: number | null) {
  if (d == null || d === 0) return '='
  return d > 0 ? '▲' : '▼'
}

// Stat groups with sections
const COMPARE_SECTIONS = [
  {
    title: '💚 Survivability', color: 'green',
    fields: [
      { key: 'total_hp', label: 'Hull HP', unit: '' },
      { key: 'shield_hp', label: 'Shield HP', unit: '' },
      { key: 'armor_physical', label: 'Physical Armor', unit: '×' },
      { key: 'armor_energy', label: 'Energy Armor', unit: '×' },
      { key: 'armor_distortion', label: 'Distortion Armor', unit: '×' },
    ],
  },
  {
    title: '🎯 Weapons', color: 'red',
    fields: [
      { key: 'weapon_damage_total', label: 'Weapons DPS', unit: '' },
      { key: 'missile_damage_total', label: 'Missiles Damage', unit: '' },
    ],
  },
  {
    title: '🚀 Mobility', color: 'blue',
    fields: [
      { key: 'scm_speed', label: 'SCM Speed', unit: 'm/s' },
      { key: 'max_speed', label: 'Max Speed', unit: 'm/s' },
      { key: 'boost_speed_forward', label: 'Forward Boost', unit: 'm/s' },
      { key: 'pitch_max', label: 'Pitch', unit: '°/s' },
      { key: 'yaw_max', label: 'Yaw', unit: '°/s' },
      { key: 'roll_max', label: 'Roll', unit: '°/s' },
    ],
  },
  {
    title: '⛽ Fuel & Cargo', color: 'amber',
    fields: [
      { key: 'hydrogen_fuel_capacity', label: 'H₂ Fuel', unit: 'L' },
      { key: 'quantum_fuel_capacity', label: 'QT Fuel', unit: 'L' },
      { key: 'cargo_capacity', label: 'Cargo', unit: 'SCU' },
    ],
  },
  {
    title: '📐 Specifications', color: 'purple',
    fields: [
      { key: 'mass', label: 'Mass', unit: 'kg' },
      { key: 'crew_size', label: 'Crew', unit: '' },
      { key: 'cross_section_x', label: 'Section X', unit: 'm' },
      { key: 'cross_section_y', label: 'Section Y', unit: 'm' },
      { key: 'cross_section_z', label: 'Section Z', unit: 'm' },
    ],
  },
]
</script>

<template>
  <div class="space-y-4">
    <h1 class="section-title">⚖️ Ship Comparison</h1>

    <!-- Ship pickers -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div class="card p-4 relative z-10" ref="dropdown1">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-6 h-6 rounded-md bg-sv-accent/15 flex items-center justify-center text-[10px] font-bold text-sv-accent">1</div>
          <label class="text-[10px] text-sv-muted uppercase tracking-wider font-semibold">Ship</label>
        </div>
        <input
          v-model="ship1Query" @input="debouncedSearch1(ship1Query)"
          class="input w-full" placeholder="Search a ship…"
        />
        <div v-if="ship1Results.length" class="absolute z-50 left-4 right-4 mt-1 bg-sv-panel border border-sv-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
          <div v-for="s in ship1Results" :key="s.uuid" @click="selectShip(s, 1)"
            class="px-3 py-2 hover:bg-sv-accent/10 cursor-pointer text-xs border-b border-sv-border/20 last:border-0">
            <span class="text-sv-text-bright font-medium">{{ s.name }}</span>
            <span class="text-sv-muted ml-2 text-[10px]">{{ s.manufacturer_name || s.manufacturer_code }}</span>
          </div>
        </div>
        <div v-if="comparison?.ship1" class="mt-2 text-[11px] text-sv-accent font-medium">{{ comparison.ship1.name }}</div>
      </div>
      <div class="card p-4 relative z-10" ref="dropdown2">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center text-[10px] font-bold text-amber-400">2</div>
          <label class="text-[10px] text-sv-muted uppercase tracking-wider font-semibold">Ship</label>
        </div>
        <input
          v-model="ship2Query" @input="debouncedSearch2(ship2Query)"
          class="input w-full" placeholder="Search a ship…"
        />
        <div v-if="ship2Results.length" class="absolute z-50 left-4 right-4 mt-1 bg-sv-panel border border-sv-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
          <div v-for="s in ship2Results" :key="s.uuid" @click="selectShip(s, 2)"
            class="px-3 py-2 hover:bg-sv-accent/10 cursor-pointer text-xs border-b border-sv-border/20 last:border-0">
            <span class="text-sv-text-bright font-medium">{{ s.name }}</span>
            <span class="text-sv-muted ml-2 text-[10px]">{{ s.manufacturer_name || s.manufacturer_code }}</span>
          </div>
        </div>
        <div v-if="comparison?.ship2" class="mt-2 text-[11px] text-amber-400 font-medium">{{ comparison.ship2.name }}</div>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="card border-red-500/50 p-3 text-red-400 text-sm">{{ error }}</div>

    <!-- Comparison -->
    <LoadingState :loading="loading">
      <div v-if="comparison" class="space-y-3">
        <!-- Ship headers row -->
        <div class="card overflow-hidden">
          <table class="w-full">
            <thead>
              <tr class="border-b border-sv-border/40">
                <th class="py-3 px-4 text-left w-1/4"></th>
                <th class="py-3 px-4 text-right w-1/4">
                  <div class="text-sv-accent font-semibold text-sm">{{ comparison.ship1?.name }}</div>
                  <div class="text-[10px] text-sv-muted">{{ comparison.ship1?.manufacturer_code }}</div>
                </th>
                <th class="py-3 px-4 text-center w-16 text-[10px] text-sv-muted uppercase">Δ</th>
                <th class="py-3 px-4 text-left w-1/4">
                  <div class="text-amber-400 font-semibold text-sm">{{ comparison.ship2?.name }}</div>
                  <div class="text-[10px] text-sv-muted">{{ comparison.ship2?.manufacturer_code }}</div>
                </th>
              </tr>
            </thead>
          </table>
        </div>

        <!-- Stat sections -->
        <div v-for="section in COMPARE_SECTIONS" :key="section.title" class="card overflow-hidden">
          <div class="px-4 py-2 border-b border-sv-border/30"
            :class="{
              'bg-emerald-500/5': section.color === 'green',
              'bg-red-500/5': section.color === 'red',
              'bg-blue-500/5': section.color === 'blue',
              'bg-amber-500/5': section.color === 'amber',
              'bg-purple-500/5': section.color === 'purple',
            }">
            <span class="text-[11px] font-semibold uppercase tracking-wider"
              :class="{
                'text-emerald-400': section.color === 'green',
                'text-red-400': section.color === 'red',
                'text-blue-400': section.color === 'blue',
                'text-amber-400': section.color === 'amber',
                'text-purple-400': section.color === 'purple',
              }">
              {{ section.title }}
            </span>
          </div>
          <table class="w-full text-xs">
            <tbody>
              <tr v-for="f in section.fields" :key="f.key"
                class="border-b border-sv-border/10 hover:bg-sv-panel-light/20 transition-colors">
                <td class="py-2 px-4 text-sv-muted w-1/4">{{ f.label }}</td>
                <td class="py-2 px-4 text-right text-sv-text-bright font-medium w-1/4">
                  {{ fmt(getVal(comparison.full?.ship1, f.key)) }}
                  <span v-if="f.unit && getVal(comparison.full?.ship1, f.key) != null" class="text-sv-muted text-[10px] ml-0.5">{{ f.unit }}</span>
                </td>
                <td class="py-2 px-4 text-center w-16 font-mono text-[11px]" :class="deltaColor(getDelta(f.key), f.key)">
                  <template v-if="getDelta(f.key) != null && getDelta(f.key) !== 0">
                    {{ deltaIcon(getDelta(f.key)) }}
                    {{ getDelta(f.key) > 0 ? '+' : '' }}{{ fmt(getDelta(f.key)) }}
                  </template>
                  <span v-else class="text-sv-muted/40">=</span>
                </td>
                <td class="py-2 px-4 text-sv-text-bright font-medium w-1/4">
                  {{ fmt(getVal(comparison.full?.ship2, f.key)) }}
                  <span v-if="f.unit && getVal(comparison.full?.ship2, f.key) != null" class="text-sv-muted text-[10px] ml-0.5">{{ f.unit }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="card p-12 text-center">
        <div class="text-4xl mb-3 opacity-40">⚖️</div>
        <h2 class="text-sv-text-bright font-semibold mb-1">Ship Comparator</h2>
        <p class="text-sv-muted text-sm">Select two ships above to compare<br/>their stats side by side.</p>
      </div>
    </LoadingState>
  </div>
</template>
