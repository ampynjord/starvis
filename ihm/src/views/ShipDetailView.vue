<script setup lang="ts">
import LoadingState from '@/components/LoadingState.vue'
import StatBlock from '@/components/StatBlock.vue'
import { getShip, getShipLoadout, getShipModules, type Ship } from '@/services/api'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const ship = ref<Ship | null>(null)
const loadout = ref<any[]>([])
const modules = ref<any[]>([])
const loading = ref(true)

onMounted(async () => {
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
})

function fmt(v: any, unit = '') {
  if (v == null || v === 0) return '—'
  const n = typeof v === 'number' ? v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : v
  return unit ? `${n} ${unit}` : n
}

const groupedLoadout = computed(() => {
  const groups: Record<string, any[]> = {}
  for (const item of loadout.value) {
    const key = item.port_type || item.type || 'Autre'
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }
  return groups
})

const armorStats = computed(() => {
  if (!ship.value) return []
  return [
    { label: 'Physique', value: ship.value.armor_physical },
    { label: 'Énergie', value: ship.value.armor_energy },
    { label: 'Distorsion', value: ship.value.armor_distortion },
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
            <button @click="router.back()" class="btn-ghost text-xs mb-2">← Retour</button>
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
                <span v-if="ship.ship_matrix_id" class="badge-green text-[10px]">Ship Matrix</span>
                <router-link :to="`/compare?ship1=${ship.class_name || ship.uuid}`" class="btn-primary text-xs">
                  Comparer
                </router-link>
                <router-link :to="`/loadout/${ship.class_name || ship.uuid}`" class="btn-outline text-xs">
                  Simulateur
                </router-link>
                <a v-if="(ship as any).store_url" :href="(ship as any).store_url" target="_blank" class="btn-ghost text-xs border border-sv-border">
                  RSI ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats principales -->
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <StatBlock label="HP Total" :value="fmt(ship.total_hp)" color="green" />
        <StatBlock label="Bouclier" :value="fmt(ship.shield_hp)" color="blue" />
        <StatBlock label="Masse" :value="fmt(Math.round(ship.mass))" unit="kg" />
        <StatBlock label="Vitesse SCM" :value="fmt(ship.scm_speed)" unit="m/s" />
        <StatBlock label="Vitesse max" :value="fmt(ship.max_speed)" unit="m/s" />
        <StatBlock label="Cargo" :value="fmt(ship.cargo_capacity)" unit="SCU" color="amber" />
        <StatBlock label="Missiles" :value="fmt(ship.missile_damage_total)" unit="dmg" color="red" />
      </div>

      <!-- Détails en colonnes -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <!-- Mobilité -->
        <div class="card p-4">
          <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-3">Mobilité</h2>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between"><span class="text-sv-muted">Boost avant</span><span class="text-sv-text">{{ fmt(ship.boost_speed_forward) }} m/s</span></div>
            <div class="flex justify-between"><span class="text-sv-muted">Pitch max</span><span class="text-sv-text">{{ fmt(ship.pitch_max) }} °/s</span></div>
            <div class="flex justify-between"><span class="text-sv-muted">Yaw max</span><span class="text-sv-text">{{ fmt(ship.yaw_max) }} °/s</span></div>
            <div class="flex justify-between"><span class="text-sv-muted">Roll max</span><span class="text-sv-text">{{ fmt(ship.roll_max) }} °/s</span></div>
          </div>
        </div>

        <!-- Réservoirs -->
        <div class="card p-4">
          <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-3">Réservoirs</h2>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between"><span class="text-sv-muted">H₂ Fuel</span><span class="text-sv-text">{{ fmt(ship.hydrogen_fuel_capacity) }} L</span></div>
            <div class="flex justify-between"><span class="text-sv-muted">QT Fuel</span><span class="text-sv-text">{{ fmt(ship.quantum_fuel_capacity) }} L</span></div>
            <div class="flex justify-between"><span class="text-sv-muted">Crew</span><span class="text-sv-text">{{ fmt(ship.crew_size) }}</span></div>
          </div>
        </div>

        <!-- Armure -->
        <div class="card p-4">
          <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-3">Armure</h2>
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
        <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-2">Description RSI</h2>
        <p class="text-sv-muted text-sm leading-relaxed">{{ (ship as any).sm_description }}</p>
      </div>

      <!-- Modules (Retaliator, Apollo…) -->
      <div v-if="modules.length > 0" class="card p-4">
        <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-3">
          Modules <span class="text-sv-muted font-normal">({{ modules.length }} emplacements)</span>
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
            <span v-if="mod.is_default" class="badge-green text-[10px] ml-2 shrink-0">Défaut</span>
          </div>
        </div>
      </div>

      <!-- Loadout -->
      <div class="card p-4">
        <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-3">
          Loadout <span class="text-sv-muted font-normal">({{ loadout.length }} composants)</span>
        </h2>
        <div v-if="loadout.length === 0" class="text-sv-muted text-center py-4 text-sm">Aucun composant rattaché</div>
        <div v-else class="space-y-4">
          <div v-for="(items, group) in groupedLoadout" :key="group">
            <h3 class="text-[11px] font-semibold text-sv-text-bright uppercase tracking-wider mb-1.5 border-b border-sv-border/30 pb-1">
              {{ group }} <span class="text-sv-muted font-normal">({{ items.length }})</span>
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              <component
                :is="item.component_uuid ? 'router-link' : 'div'"
                v-for="item in items"
                :key="item.id || item.component_uuid || item.port_name"
                v-bind="item.component_uuid ? { to: `/components/${item.component_uuid}` } : {}"
                class="flex items-center justify-between border border-sv-border/40 rounded px-2.5 py-1.5 transition-colors"
                :class="item.component_uuid ? 'hover:border-sv-accent/50 hover:bg-sv-panel-light/30 cursor-pointer' : 'opacity-60'"
              >
                <div class="min-w-0">
                  <div class="text-xs font-medium text-sv-text-bright truncate">{{ item.component_name || item.component_class_name || '—' }}</div>
                  <div class="text-[10px] text-sv-muted">{{ item.port_name }} · S{{ item.component_size || '?' }}</div>
                </div>
                <span class="badge-blue text-[10px] ml-2 shrink-0">{{ item.component_type || item.port_type || '?' }}</span>
              </component>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="text-center py-12 text-sv-muted">Vaisseau introuvable</div>
  </LoadingState>
</template>
