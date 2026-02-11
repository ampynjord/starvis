<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getShip, getShipLoadout, type Ship } from '@/services/api'
import LoadingState from '@/components/LoadingState.vue'
import StatBlock from '@/components/StatBlock.vue'

const route = useRoute()
const router = useRouter()
const ship = ref<Ship | null>(null)
const loadout = ref<any[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const uuid = route.params.uuid as string
    const [shipRes, loadoutRes] = await Promise.all([
      getShip(uuid),
      getShipLoadout(uuid).catch(() => ({ data: [] })),
    ])
    ship.value = shipRes.data
    loadout.value = loadoutRes.data || []
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
    <div v-if="ship" class="space-y-6">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <button @click="router.back()" class="btn-ghost text-sm mb-2">← Retour</button>
          <h1 class="text-3xl font-bold text-sc-text-bright">{{ ship.name }}</h1>
          <p class="text-sc-muted">
            {{ ship.manufacturer_code }}
            <span v-if="ship.career"> · {{ ship.career }}</span>
            <span v-if="ship.role"> · {{ ship.role }}</span>
          </p>
        </div>
        <div class="flex gap-2">
          <span v-if="ship.ship_matrix_id" class="badge-green">Ship Matrix</span>
          <router-link :to="`/compare?ship1=${ship.class_name || ship.uuid}`" class="btn-primary text-sm">
            Comparer
          </router-link>
          <router-link :to="`/loadout/${ship.class_name || ship.uuid}`" class="btn-ghost text-sm border border-sc-border">
            Simulateur
          </router-link>
        </div>
      </div>

      <!-- Stats principales -->
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatBlock label="HP Total" :value="fmt(ship.total_hp)" color="green" />
        <StatBlock label="Bouclier HP" :value="fmt(ship.shield_hp)" color="blue" />
        <StatBlock label="Masse" :value="fmt(Math.round(ship.mass))" unit="kg" />
        <StatBlock label="SCM Speed" :value="fmt(ship.scm_speed)" unit="m/s" />
        <StatBlock label="Max Speed" :value="fmt(ship.max_speed)" unit="m/s" />
        <StatBlock label="Boost Fwd" :value="fmt(ship.boost_speed_forward)" unit="m/s" />
        <StatBlock label="Pitch Max" :value="fmt(ship.pitch_max)" unit="°/s" />
        <StatBlock label="Yaw Max" :value="fmt(ship.yaw_max)" unit="°/s" />
        <StatBlock label="Roll Max" :value="fmt(ship.roll_max)" unit="°/s" />
        <StatBlock label="H₂ Fuel" :value="fmt(ship.hydrogen_fuel_capacity)" unit="L" />
        <StatBlock label="QT Fuel" :value="fmt(ship.quantum_fuel_capacity)" unit="L" />
        <StatBlock label="Cargo" :value="fmt(ship.cargo_capacity)" unit="SCU" color="amber" />
        <StatBlock label="Crew" :value="fmt(ship.crew_size)" />
        <StatBlock label="Missiles" :value="fmt(ship.missile_damage_total)" unit="dmg" color="red" />
      </div>

      <!-- Armure -->
      <div class="card p-4">
        <h2 class="text-lg font-semibold text-sc-text-bright mb-3">🛡️ Armure</h2>
        <div class="grid grid-cols-3 gap-4">
          <div v-for="a in armorStats" :key="a.label" class="text-center">
            <div class="stat-label">{{ a.label }}</div>
            <div class="stat-value">{{ fmt(a.value) }}</div>
          </div>
        </div>
      </div>

      <!-- Cross-section -->
      <div class="card p-4">
        <h2 class="text-lg font-semibold text-sc-text-bright mb-3">📐 Cross-Section</h2>
        <div class="grid grid-cols-3 gap-4 text-center">
          <div><span class="stat-label">X</span><div class="stat-value">{{ fmt(ship.cross_section_x) }} m</div></div>
          <div><span class="stat-label">Y</span><div class="stat-value">{{ fmt(ship.cross_section_y) }} m</div></div>
          <div><span class="stat-label">Z</span><div class="stat-value">{{ fmt(ship.cross_section_z) }} m</div></div>
        </div>
      </div>

      <!-- Loadout -->
      <div class="card p-4">
        <h2 class="text-lg font-semibold text-sc-text-bright mb-3">🔧 Loadout ({{ loadout.length }} composants)</h2>
        <div v-if="loadout.length === 0" class="text-sc-muted text-center py-4">Aucun composant rattaché</div>
        <div v-else class="space-y-4">
          <div v-for="(items, group) in groupedLoadout" :key="group">
            <h3 class="text-sm font-semibold text-sc-accent uppercase tracking-wider mb-2">{{ group }}</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <router-link
                v-for="item in items"
                :key="item.component_uuid || item.uuid"
                :to="`/components/${item.component_uuid || item.uuid}`"
                class="flex items-center justify-between border border-sc-border rounded px-3 py-2 hover:border-sc-accent/50 transition-colors"
              >
                <div>
                  <div class="text-sm font-medium text-sc-text-bright">{{ item.component_name || item.name }}</div>
                  <div class="text-xs text-sc-muted">{{ item.port_name }} · S{{ item.size || '?' }}</div>
                </div>
                <span class="badge-blue text-xs">{{ item.component_type || item.type }}</span>
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="text-center py-12 text-sc-muted">Vaisseau introuvable</div>
  </LoadingState>
</template>
