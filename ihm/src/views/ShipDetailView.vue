<script setup lang="ts">
import LoadingState from '@/components/LoadingState.vue'
import StatBlock from '@/components/StatBlock.vue'
import { getShip, getShipLoadout, getShipModules, type Ship } from '@/services/api'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const ship = ref<Ship | null>(null)
const loadout = ref<any[]>([])
const modules = ref<any[]>([])
const loading = ref(true)

async function loadData() {
  loading.value = true
  ship.value = null
  try {
    const uuid = route.params.uuid as string
    const [shipRes, loadoutRes, modulesRes] = await Promise.all([
      getShip(uuid),
      getShipLoadout(uuid).catch(() => ({ data: [] })),
      getShipModules(uuid).catch(() => ({ data: [] })),
    ])
    ship.value = shipRes.data
    loadout.value = loadoutRes.data || []
    modules.value = modulesRes.data || []
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
watch(() => route.params.uuid, (newUuid, oldUuid) => {
  if (newUuid && newUuid !== oldUuid) loadData()
})

function fmt(v: any, unit = '') {
  if (v == null || v === 0) return '—'
  const n = typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : v
  return unit ? `${n} ${unit}` : n
}

const groupedLoadout = computed(() => {
  // Group root loadout nodes by port_type for tree display (Erkul-style categories)
  const groups: Record<string, { label: string; icon: string; color: string; order: number; nodes: any[] }> = {}
  const typeMap: Record<string, { label: string; icon: string; color: string; order: number }> = {
    'WeaponGun': { label: 'Weapons', icon: '🎯', color: 'text-red-400', order: 1 },
    'Weapon': { label: 'Weapons', icon: '🎯', color: 'text-red-400', order: 1 },
    'Gimbal': { label: 'Weapons', icon: '🎯', color: 'text-red-400', order: 1 },
    'TurretBase': { label: 'Turrets', icon: '🔫', color: 'text-red-400', order: 2 },
    'Turret': { label: 'Turrets', icon: '🔫', color: 'text-red-400', order: 2 },
    'MissileLauncher': { label: 'Missiles & Bombs', icon: '🚀', color: 'text-amber-400', order: 3 },
    'MissileRack': { label: 'Missiles & Bombs', icon: '🚀', color: 'text-amber-400', order: 3 },
    'Shield': { label: 'Shields', icon: '🛡️', color: 'text-blue-400', order: 4 },
    'ShieldGenerator': { label: 'Shields', icon: '🛡️', color: 'text-blue-400', order: 4 },
    'PowerPlant': { label: 'Power Plants', icon: '⚡', color: 'text-green-400', order: 5 },
    'Cooler': { label: 'Coolers', icon: '❄️', color: 'text-cyan-400', order: 6 },
    'QuantumDrive': { label: 'Quantum Drive', icon: '💫', color: 'text-purple-400', order: 7 },
    'Radar': { label: 'Radar', icon: '📡', color: 'text-blue-400', order: 8 },
    'EMP': { label: 'EMP', icon: '⚡', color: 'text-purple-400', order: 9 },
    'MainThruster': { label: 'Thrusters', icon: '🔥', color: 'text-amber-400', order: 10 },
    'ManneuverThruster': { label: 'Thrusters', icon: '🔥', color: 'text-amber-400', order: 10 },
    'Thruster': { label: 'Thrusters', icon: '🔥', color: 'text-amber-400', order: 10 },
    'QuantumInterdictionGenerator': { label: 'QED', icon: '🔒', color: 'text-purple-400', order: 11 },
    'Countermeasure': { label: 'Countermeasures', icon: '🎇', color: 'text-amber-400', order: 12 },
  }

  const hiddenTypes = new Set([
    'FuelIntake', 'FuelTank', 'QuantumFuelTank', 'HydrogenFuelTank',
    'LifeSupport', 'FlightController', 'SelfDestruct', 'Transponder',
    'Scanner', 'Ping', 'Armor', 'Light', 'LandingGear', 'Door',
    'Seat', 'Container', 'WeaponRack',
  ])

  for (const item of loadout.value) {
    const type = item.component_type || item.port_type || 'Other'
    // Skip hidden types
    const isHidden = Array.from(hiddenTypes).some(h => type.toLowerCase().includes(h.toLowerCase()))
    if (isHidden) continue
    if (type === 'Other' && !Object.keys(typeMap).some(k => (item.component_type || '').toLowerCase().includes(k.toLowerCase()))) continue

    const info = Object.entries(typeMap).find(([k]) => type.toLowerCase().includes(k.toLowerCase()))?.[1]
    if (!info) continue // Hide unknown types
    const key = info.label
    if (!groups[key]) groups[key] = { ...info, nodes: [] }
    groups[key].nodes.push(item)
  }

  return Object.entries(groups)
    .sort((a, b) => a[1].order - b[1].order)
})

const armorStats = computed(() => {
  if (!ship.value) return []
  return [
    { label: 'Physical', value: ship.value.armor_physical },
    { label: 'Energy', value: ship.value.armor_energy },
    { label: 'Distortion', value: ship.value.armor_distortion },
  ]
})
</script>

<template>
  <LoadingState :loading="loading">
    <div v-if="ship" class="space-y-5">
      <!-- Header with thumbnail -->
      <div class="card overflow-hidden">
        <div class="relative">
          <div v-if="(ship as any).thumbnail_large || (ship as any).thumbnail" class="h-48 sm:h-64 overflow-hidden">
            <img
              :src="(ship as any).thumbnail_large || (ship as any).thumbnail"
              :alt="ship.name"
              class="w-full h-full object-cover"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-sv-panel via-transparent to-transparent" />
          </div>
          <div class="relative p-4" :class="{ '-mt-16': (ship as any).thumbnail_large || (ship as any).thumbnail }">
            <button @click="router.back()" class="btn-ghost text-xs mb-2">← Back</button>
            <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <h1 class="text-2xl font-bold text-sv-text-bright">{{ ship.name }}</h1>
                <p class="text-sv-muted text-sm">
                  {{ (ship as any).manufacturer_name || ship.manufacturer_code }}
                  <span v-if="ship.career"> · {{ ship.career }}</span>
                  <span v-if="ship.role"> · {{ ship.role }}</span>
                </p>
              </div>
              <div class="flex gap-2 shrink-0">
                <span v-if="(ship as any).production_status" class="badge-purple text-[10px]">
                  {{ (ship as any).production_status }}
                </span>
                <span v-if="ship.ship_matrix_id" class="badge-cyan text-[10px]" title="Linked to RSI Ship Matrix">✓ Matrix</span>
                <router-link :to="`/compare?ship1=${ship.class_name || ship.uuid}`" class="btn-primary text-xs">
                  Compare
                </router-link>
                <router-link :to="`/loadout/${ship.class_name || ship.uuid}`" class="btn-outline text-xs">
                  Loadout Manager
                </router-link>
                <a v-if="(ship as any).store_url" :href="'https://robertsspaceindustries.com' + (ship as any).store_url" target="_blank" class="btn-ghost text-xs border border-sv-border">
                  RSI ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats principales -->
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <StatBlock label="Total HP" :value="fmt(ship.total_hp)" color="green" />
        <StatBlock label="Shield" :value="fmt(ship.shield_hp)" color="blue" />
        <StatBlock label="Mass" :value="fmt(Math.round(ship.mass))" unit="kg" />
        <StatBlock label="SCM Speed" :value="fmt(ship.scm_speed)" unit="m/s" />
        <StatBlock label="Max Speed" :value="fmt(ship.max_speed)" unit="m/s" />
        <StatBlock label="Cargo" :value="fmt(ship.cargo_capacity)" unit="SCU" color="amber" />
        <StatBlock label="Weapons" :value="fmt(ship.weapon_damage_total)" unit="dps" color="red" />
        <StatBlock label="Missiles" :value="fmt(ship.missile_damage_total)" unit="dmg" color="red" />
      </div>

      <!-- Détails en colonnes -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <!-- Mobilité -->
        <div class="card p-4">
          <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-3">Mobility</h2>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between"><span class="text-sv-muted">Forward Boost</span><span class="text-sv-text">{{ fmt(ship.boost_speed_forward) }} m/s</span></div>
            <div class="flex justify-between"><span class="text-sv-muted">Pitch max</span><span class="text-sv-text">{{ fmt(ship.pitch_max) }} °/s</span></div>
            <div class="flex justify-between"><span class="text-sv-muted">Yaw max</span><span class="text-sv-text">{{ fmt(ship.yaw_max) }} °/s</span></div>
            <div class="flex justify-between"><span class="text-sv-muted">Roll max</span><span class="text-sv-text">{{ fmt(ship.roll_max) }} °/s</span></div>
          </div>
        </div>

        <!-- Réservoirs -->
        <div class="card p-4">
          <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-3">Fuel Tanks</h2>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between"><span class="text-sv-muted">H₂ Fuel</span><span class="text-sv-text">{{ fmt(ship.hydrogen_fuel_capacity) }} L</span></div>
            <div class="flex justify-between"><span class="text-sv-muted">QT Fuel</span><span class="text-sv-text">{{ fmt(ship.quantum_fuel_capacity) }} L</span></div>
            <div class="flex justify-between"><span class="text-sv-muted">Crew</span><span class="text-sv-text">{{ fmt(ship.crew_size) }}</span></div>
          </div>
        </div>

        <!-- Armure -->
        <div class="card p-4">
          <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-3">Armor</h2>
          <div class="space-y-2 text-sm">
            <div v-for="a in armorStats" :key="a.label" class="flex justify-between">
              <span class="text-sv-muted">{{ a.label }}</span>
              <span class="text-sv-text">{{ fmt(a.value) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Cross-section -->
      <div class="card p-4">
        <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-3">Cross-Section</h2>
        <div class="grid grid-cols-3 gap-4 text-center text-sm">
          <div><div class="text-sv-muted text-xs">X</div><div class="text-sv-text font-medium">{{ fmt(ship.cross_section_x) }} m</div></div>
          <div><div class="text-sv-muted text-xs">Y</div><div class="text-sv-text font-medium">{{ fmt(ship.cross_section_y) }} m</div></div>
          <div><div class="text-sv-muted text-xs">Z</div><div class="text-sv-text font-medium">{{ fmt(ship.cross_section_z) }} m</div></div>
        </div>
      </div>

      <!-- Ship Matrix description -->
      <div v-if="(ship as any).sm_description" class="card p-4">
        <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-2">RSI Description</h2>
        <p class="text-sv-muted text-sm leading-relaxed">{{ (ship as any).sm_description }}</p>
      </div>

      <!-- Modules (Retaliator, Apollo…) -->
      <div v-if="modules.length > 0" class="card p-4">
        <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-3">
          Modules <span class="text-sv-muted font-normal">({{ modules.length }} slots)</span>
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
          <div
            v-for="mod in modules"
            :key="mod.id"
            class="flex items-center justify-between border border-sv-border/40 rounded px-2.5 py-1.5"
          >
            <div class="min-w-0">
              <div class="text-xs font-medium text-sv-text-bright truncate">{{ mod.module_name || '—' }}</div>
              <div class="text-[10px] text-sv-muted">{{ mod.slot_display_name || mod.slot_name }}</div>
            </div>
            <span v-if="mod.is_default" class="badge-green text-[10px] ml-2 shrink-0">Default</span>
          </div>
        </div>
      </div>

      <!-- Loadout -->
      <div class="card p-4">
        <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-3">
          Loadout <span class="text-sv-muted font-normal">({{ loadout.reduce((s: number, n: any) => s + 1 + (n.children?.length || 0), 0) }} components)</span>
        </h2>
        <div v-if="loadout.length === 0" class="text-sv-muted text-center py-4 text-sm">No attached components</div>
        <div v-else class="space-y-4">
          <div v-for="[key, group] in groupedLoadout" :key="key">
            <h3 class="text-[11px] font-semibold uppercase tracking-wider mb-1.5 border-b border-sv-border/30 pb-1 flex items-center gap-1.5"
              :class="group.color">
              <span>{{ group.icon }}</span>
              {{ group.label }}
              <span class="text-sv-muted font-normal">({{ group.nodes.length }})</span>
            </h3>
            <div class="space-y-0.5">
              <template v-for="item in group.nodes" :key="item.id || item.port_name">
                <!-- Root node -->
                <component
                  :is="item.component_uuid ? 'router-link' : 'div'"
                  v-bind="item.component_uuid ? { to: `/components/${item.component_uuid}` } : {}"
                  class="flex items-center gap-2 border border-sv-border/40 rounded px-2.5 py-1.5 transition-colors"
                  :class="item.component_uuid ? 'hover:border-sv-accent/50 hover:bg-sv-panel-light/30 cursor-pointer' : 'opacity-60'"
                >
                  <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sv-darker/50 shrink-0" :class="group.color">
                    S{{ item.component_size || '?' }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="text-xs font-medium text-sv-text-bright truncate">{{ item.component_name || item.component_class_name || '—' }}</div>
                    <div class="text-[10px] text-sv-muted truncate">{{ item.port_name }}</div>
                  </div>
                  <span v-if="item.children && item.children.length > 0"
                    class="text-[9px] px-1.5 py-0.5 rounded-full bg-sv-darker text-sv-muted shrink-0">
                    {{ item.children.length }}×
                  </span>
                  <span class="badge-blue text-[10px] ml-1 shrink-0">{{ item.component_type || item.port_type || '?' }}</span>
                </component>
                <!-- Children (indented) -->
                <div v-if="item.children && item.children.length > 0" class="ml-6 space-y-0.5">
                  <component
                    v-for="child in item.children"
                    :key="child.id || child.port_name"
                    :is="child.component_uuid ? 'router-link' : 'div'"
                    v-bind="child.component_uuid ? { to: `/components/${child.component_uuid}` } : {}"
                    class="flex items-center gap-2 border border-sv-border/20 rounded px-2 py-1 text-[11px] relative transition-colors"
                    :class="child.component_uuid ? 'hover:border-sv-accent/50 hover:bg-sv-panel-light/20 cursor-pointer' : 'opacity-50'"
                  >
                    <div class="absolute -left-3 top-1/2 w-3 h-px bg-sv-border/30"></div>
                    <span class="text-[9px] font-bold px-1 py-0.5 rounded bg-sv-darker/30 shrink-0" :class="group.color">
                      S{{ child.component_size || '?' }}
                    </span>
                    <div class="min-w-0 flex-1">
                      <span class="text-sv-text truncate">{{ child.component_name || child.component_class_name || '—' }}</span>
                    </div>
                    <span class="text-[9px] px-1 py-0.5 rounded bg-sv-darker/20 text-sv-muted/60 shrink-0">{{ child.component_type || child.port_type }}</span>
                  </component>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="text-center py-12 text-sv-muted">Ship not found</div>
  </LoadingState>
</template>
