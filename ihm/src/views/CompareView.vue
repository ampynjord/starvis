<script setup lang="ts">
import LoadingState from '@/components/LoadingState.vue'
import { compareShips, getShips, type Ship } from '@/services/api'
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
const comparison = ref<any>(null)
const loading = ref(false)
const error = ref('')

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
  } catch (e: any) {
    error.value = e.message || 'Erreur de comparaison'
  } finally {
    loading.value = false
  }
}

// Auto-compare if both ships provided in URL
watch([ship1, ship2], () => { if (ship1.value && ship2.value) doCompare() }, { immediate: true })

function deltaColor(val: number) {
  if (val > 0) return 'text-emerald-400'
  if (val < 0) return 'text-red-400'
  return 'text-sc-muted'
}

function fmt(v: any) {
  if (v == null) return '—'
  if (typeof v === 'number') return v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
  return v
}

const COMPARE_FIELDS = [
  { key: 'total_hp', label: 'HP Total' },
  { key: 'shield_hp', label: 'Bouclier HP' },
  { key: 'mass', label: 'Masse (kg)' },
  { key: 'scm_speed', label: 'SCM Speed (m/s)' },
  { key: 'max_speed', label: 'Max Speed (m/s)' },
  { key: 'boost_speed_forward', label: 'Boost Forward (m/s)' },
  { key: 'pitch_max', label: 'Pitch (°/s)' },
  { key: 'yaw_max', label: 'Yaw (°/s)' },
  { key: 'roll_max', label: 'Roll (°/s)' },
  { key: 'hydrogen_fuel_capacity', label: 'H₂ Fuel (L)' },
  { key: 'quantum_fuel_capacity', label: 'QT Fuel (L)' },
  { key: 'cargo_capacity', label: 'Cargo (SCU)' },
  { key: 'crew_size', label: 'Crew' },
  { key: 'missile_damage_total', label: 'Missiles (dmg)' },
  { key: 'armor_physical', label: 'Armure Physique' },
  { key: 'armor_energy', label: 'Armure Énergie' },
  { key: 'armor_distortion', label: 'Armure Distorsion' },
]
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold text-sc-text-bright">⚔️ Comparaison de vaisseaux</h1>

    <!-- Ship pickers -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div class="card p-4 relative">
        <label class="stat-label mb-1 block">Vaisseau 1</label>
        <input
          v-model="ship1Query" @input="searchShips(ship1Query, 1)"
          class="input w-full" placeholder="Chercher un vaisseau…"
        />
        <div v-if="ship1Results.length" class="absolute z-10 left-4 right-4 mt-1 bg-sc-panel border border-sc-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          <div v-for="s in ship1Results" :key="s.uuid" @click="selectShip(s, 1)" class="px-3 py-2 hover:bg-sc-border/50 cursor-pointer text-sm">
            <span class="text-sc-text-bright">{{ s.name }}</span>
            <span class="text-sc-muted ml-2">{{ s.manufacturer_code }}</span>
          </div>
        </div>
      </div>
      <div class="card p-4 relative">
        <label class="stat-label mb-1 block">Vaisseau 2</label>
        <input
          v-model="ship2Query" @input="searchShips(ship2Query, 2)"
          class="input w-full" placeholder="Chercher un vaisseau…"
        />
        <div v-if="ship2Results.length" class="absolute z-10 left-4 right-4 mt-1 bg-sc-panel border border-sc-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          <div v-for="s in ship2Results" :key="s.uuid" @click="selectShip(s, 2)" class="px-3 py-2 hover:bg-sc-border/50 cursor-pointer text-sm">
            <span class="text-sc-text-bright">{{ s.name }}</span>
            <span class="text-sc-muted ml-2">{{ s.manufacturer_code }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="card border-red-500/50 p-4 text-red-400">{{ error }}</div>

    <!-- Comparison table -->
    <LoadingState :loading="loading">
      <div v-if="comparison" class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-sc-border">
            <tr>
              <th class="py-3 px-4 text-left text-sc-muted">Stat</th>
              <th class="py-3 px-4 text-right text-sc-accent">{{ comparison.ship1?.name }}</th>
              <th class="py-3 px-4 text-center text-sc-muted">Δ</th>
              <th class="py-3 px-4 text-left text-sc-gold">{{ comparison.ship2?.name }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in COMPARE_FIELDS" :key="f.key" class="border-b border-sc-border/30 hover:bg-sc-border/10">
              <td class="py-2 px-4 text-sc-muted">{{ f.label }}</td>
              <td class="py-2 px-4 text-right text-sc-text-bright">{{ fmt(comparison.ship1?.[f.key]) }}</td>
              <td class="py-2 px-4 text-center font-mono" :class="deltaColor((comparison.delta || {})[f.key])">
                <template v-if="comparison.delta?.[f.key] != null && comparison.delta[f.key] !== 0">
                  {{ comparison.delta[f.key] > 0 ? '+' : '' }}{{ fmt(comparison.delta[f.key]) }}
                </template>
                <template v-else>=</template>
              </td>
              <td class="py-2 px-4 text-sc-text-bright">{{ fmt(comparison.ship2?.[f.key]) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="text-center py-12 text-sc-muted">
        Sélectionnez deux vaisseaux pour les comparer
      </div>
    </LoadingState>
  </div>
</template>
