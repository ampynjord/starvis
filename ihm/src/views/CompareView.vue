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
  return 'text-sv-muted'
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
  <div class="space-y-5">
    <h1 class="section-title">Comparaison de vaisseaux</h1>

    <!-- Ship pickers -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div class="card p-3 relative">
        <label class="text-[11px] text-sv-muted uppercase tracking-wider mb-1 block">Vaisseau 1</label>
        <input
          v-model="ship1Query" @input="searchShips(ship1Query, 1)"
          class="input w-full" placeholder="Chercher un vaisseau…"
        />
        <div v-if="ship1Results.length" class="absolute z-10 left-3 right-3 mt-1 bg-sv-panel border border-sv-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          <div v-for="s in ship1Results" :key="s.uuid" @click="selectShip(s, 1)" class="px-3 py-1.5 hover:bg-sv-panel-light/50 cursor-pointer text-xs">
            <span class="text-sv-text-bright">{{ s.name }}</span>
            <span class="text-sv-muted ml-2">{{ s.manufacturer_code }}</span>
          </div>
        </div>
      </div>
      <div class="card p-3 relative">
        <label class="text-[11px] text-sv-muted uppercase tracking-wider mb-1 block">Vaisseau 2</label>
        <input
          v-model="ship2Query" @input="searchShips(ship2Query, 2)"
          class="input w-full" placeholder="Chercher un vaisseau…"
        />
        <div v-if="ship2Results.length" class="absolute z-10 left-3 right-3 mt-1 bg-sv-panel border border-sv-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          <div v-for="s in ship2Results" :key="s.uuid" @click="selectShip(s, 2)" class="px-3 py-1.5 hover:bg-sv-panel-light/50 cursor-pointer text-xs">
            <span class="text-sv-text-bright">{{ s.name }}</span>
            <span class="text-sv-muted ml-2">{{ s.manufacturer_code }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="card border-red-500/50 p-3 text-red-400 text-sm">{{ error }}</div>

    <!-- Comparison table -->
    <LoadingState :loading="loading">
      <div v-if="comparison" class="card overflow-x-auto">
        <table class="w-full text-xs">
          <thead class="border-b border-sv-border">
            <tr>
              <th class="py-2.5 px-3 text-left text-sv-muted">Stat</th>
              <th class="py-2.5 px-3 text-right text-sv-accent">{{ comparison.ship1?.name }}</th>
              <th class="py-2.5 px-3 text-center text-sv-muted w-20">Δ</th>
              <th class="py-2.5 px-3 text-left text-sv-gold">{{ comparison.ship2?.name }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in COMPARE_FIELDS" :key="f.key" class="border-b border-sv-border/20 hover:bg-sv-panel-light/30">
              <td class="py-1.5 px-3 text-sv-muted">{{ f.label }}</td>
              <td class="py-1.5 px-3 text-right text-sv-text-bright">{{ fmt(comparison.ship1?.[f.key]) }}</td>
              <td class="py-1.5 px-3 text-center font-mono" :class="deltaColor((comparison.delta || {})[f.key])">
                <template v-if="comparison.delta?.[f.key] != null && comparison.delta[f.key] !== 0">
                  {{ comparison.delta[f.key] > 0 ? '+' : '' }}{{ fmt(comparison.delta[f.key]) }}
                </template>
                <template v-else>=</template>
              </td>
              <td class="py-1.5 px-3 text-sv-text-bright">{{ fmt(comparison.ship2?.[f.key]) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="text-center py-12 text-sv-muted text-sm">
        Sélectionnez deux vaisseaux pour les comparer
      </div>
    </LoadingState>
  </div>
</template>
