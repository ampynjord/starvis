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
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const shipUuid = ref((route.params.uuid as string) || '')

// Ship search
const shipQuery = ref('')
const shipResults = ref<Ship[]>([])
const ship = ref<Ship | null>(null)

// Loadout
const loadout = ref<{ port_name: string; port_type: string; component_uuid: string; component_name: string; component_type: string; size?: number }[]>([])
const swaps = ref<{ portName: string; componentUuid: string }[]>([])
const stats = ref<LoadoutStats | null>(null)

// Component picker
const editingPort = ref<string | null>(null)
const componentSearch = ref('')
const componentResults = ref<Component[]>([])
const loading = ref(false)
const calculating = ref(false)

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
  const portItem = loadout.value.find(l => l.port_name === editingPort.value)
  const params: Record<string, string> = { search: q, limit: '10' }
  if (portItem?.component_type) params.type = portItem.component_type
  if (portItem?.size != null) params.size = String(portItem.size)
  const res = await getComponents(params)
  componentResults.value = res.data
}

function swapComponent(portName: string, comp: Component) {
  const existing = swaps.value.findIndex(s => s.portName === portName)
  if (existing >= 0) swaps.value[existing].componentUuid = comp.uuid
  else swaps.value.push({ portName, componentUuid: comp.uuid })

  // Update loadout display
  const item = loadout.value.find(l => l.port_name === portName)
  if (item) {
    item.component_uuid = comp.uuid
    item.component_name = comp.name
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

onMounted(() => { if (shipUuid.value) loadShipData() })
</script>

<template>
  <div class="space-y-5">
    <h1 class="section-title">Simulateur de Loadout</h1>

    <!-- Ship picker -->
    <div class="card p-3 relative">
      <label class="text-[11px] text-sv-muted uppercase tracking-wider mb-1 block">Vaisseau</label>
      <input
        v-model="shipQuery" @input="searchShips(shipQuery)"
        class="input w-full" placeholder="Chercher un vaisseau…"
      />
      <div v-if="shipResults.length" class="absolute z-10 left-3 right-3 mt-1 bg-sv-panel border border-sv-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
        <div v-for="s in shipResults" :key="s.uuid" @click="selectShip(s)" class="px-3 py-1.5 hover:bg-sv-panel-light/50 cursor-pointer text-xs">
          <span class="text-sv-text-bright">{{ s.name }}</span>
          <span class="text-sv-muted ml-2">{{ s.manufacturer_code }}</span>
        </div>
      </div>
    </div>

    <LoadingState :loading="loading">
      <div v-if="ship" class="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <!-- Loadout editor -->
        <div class="lg:col-span-2 space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-sv-text-bright">Loadout — {{ ship.name }}</h2>
            <div class="flex gap-2">
              <span v-if="swapCount > 0" class="badge-amber text-[10px]">{{ swapCount }} swap(s)</span>
              <button v-if="swapCount > 0" @click="resetSwaps" class="btn-ghost text-[10px]">Reset</button>
            </div>
          </div>

          <div v-if="loadout.length === 0" class="card p-8 text-center text-sv-muted text-sm">Aucun composant dans le loadout</div>
          <div v-else class="space-y-1">
            <div v-for="item in loadout" :key="item.port_name"
              class="card px-2.5 py-1.5 flex items-center justify-between gap-2"
            >
              <div class="flex-1 min-w-0">
                <div class="text-xs font-medium text-sv-text-bright truncate">{{ item.component_name }}</div>
                <div class="text-[10px] text-sv-muted">{{ item.port_name }} · {{ item.component_type }}</div>
              </div>
              <div class="relative">
                <button
                  @click="editingPort = editingPort === item.port_name ? null : item.port_name; componentSearch = ''; componentResults = []"
                  class="btn-ghost text-[10px] border border-sv-border px-2 py-0.5"
                >
                  {{ editingPort === item.port_name ? '✕' : 'Swap' }}
                </button>
                <!-- Component picker dropdown -->
                <div v-if="editingPort === item.port_name" class="absolute z-20 right-0 mt-1 w-72 bg-sv-panel border border-sv-border rounded-lg shadow-lg p-2">
                  <input
                    v-model="componentSearch"
                    @input="searchComponents(componentSearch)"
                    class="input w-full text-xs mb-2"
                    placeholder="Chercher un composant…"
                    autofocus
                  />
                  <div class="max-h-40 overflow-y-auto space-y-0.5">
                    <div
                      v-for="c in componentResults"
                      :key="c.uuid"
                      @click="swapComponent(item.port_name, c)"
                      class="px-2 py-1 hover:bg-sv-panel-light/50 rounded cursor-pointer text-[11px]"
                    >
                      <div class="text-sv-text-bright">{{ c.name }}</div>
                      <div class="text-sv-muted">{{ c.type }} · S{{ c.size }} · {{ c.manufacturer_code }}</div>
                    </div>
                    <div v-if="componentSearch.length >= 2 && componentResults.length === 0" class="text-sv-muted text-center py-2 text-[11px]">Aucun résultat</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Stats panel -->
        <div class="space-y-3">
          <h2 class="text-sm font-semibold text-sv-text-bright">Statistiques</h2>
          <LoadingState :loading="calculating">
            <div v-if="stats" class="space-y-2">
              <div class="card p-3">
                <h3 class="text-[10px] text-sv-accent uppercase tracking-wider font-semibold mb-2">Armes</h3>
                <div class="grid grid-cols-2 gap-1.5">
                  <StatBlock label="Nombre" :value="String(stats.stats.weapons.count)" />
                  <StatBlock label="DPS Total" :value="stats.stats.weapons.total_dps.toLocaleString('fr-FR', { maximumFractionDigits: 1 })" color="red" />
                  <StatBlock label="Burst DPS" :value="stats.stats.weapons.total_burst_dps.toLocaleString('fr-FR', { maximumFractionDigits: 1 })" color="amber" />
                  <StatBlock label="Sustained" :value="stats.stats.weapons.total_sustained_dps.toLocaleString('fr-FR', { maximumFractionDigits: 1 })" color="amber" />
                </div>
              </div>
              <div class="card p-3">
                <h3 class="text-[10px] text-sv-accent uppercase tracking-wider font-semibold mb-2">Boucliers</h3>
                <div class="grid grid-cols-2 gap-1.5">
                  <StatBlock label="HP Total" :value="stats.stats.shields.total_hp.toLocaleString('fr-FR')" color="blue" />
                  <StatBlock label="Regen" :value="stats.stats.shields.total_regen.toLocaleString('fr-FR', { maximumFractionDigits: 1 })" unit="/s" color="blue" />
                </div>
              </div>
              <div class="card p-3">
                <h3 class="text-[10px] text-sv-accent uppercase tracking-wider font-semibold mb-2">Missiles</h3>
                <div class="grid grid-cols-2 gap-1.5">
                  <StatBlock label="Nombre" :value="String(stats.stats.missiles.count)" />
                  <StatBlock label="Dégâts Total" :value="stats.stats.missiles.total_damage.toLocaleString('fr-FR')" color="red" />
                </div>
              </div>
              <div class="card p-3">
                <h3 class="text-[10px] text-sv-accent uppercase tracking-wider font-semibold mb-2">Énergie</h3>
                <div class="grid grid-cols-2 gap-1.5">
                  <StatBlock label="Conso" :value="stats.stats.power.total_draw.toLocaleString('fr-FR', { maximumFractionDigits: 1 })" />
                  <StatBlock label="Output" :value="stats.stats.power.total_output.toLocaleString('fr-FR', { maximumFractionDigits: 1 })" color="green" />
                </div>
                <div class="mt-1 text-[10px] text-center" :class="stats.stats.power.balance >= 0 ? 'text-emerald-400' : 'text-red-400'">
                  Balance : {{ stats.stats.power.balance >= 0 ? '+' : '' }}{{ stats.stats.power.balance.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) }}
                </div>
              </div>
              <div class="card p-3">
                <h3 class="text-[10px] text-sv-accent uppercase tracking-wider font-semibold mb-2">Thermique</h3>
                <div class="grid grid-cols-2 gap-1.5">
                  <StatBlock label="Chaleur" :value="stats.stats.thermal.total_heat_generation.toLocaleString('fr-FR', { maximumFractionDigits: 1 })" />
                  <StatBlock label="Cooling" :value="stats.stats.thermal.total_cooling_rate.toLocaleString('fr-FR', { maximumFractionDigits: 1 })" color="blue" />
                </div>
                <div class="mt-1 text-[10px] text-center" :class="stats.stats.thermal.balance >= 0 ? 'text-emerald-400' : 'text-red-400'">
                  Balance : {{ stats.stats.thermal.balance >= 0 ? '+' : '' }}{{ stats.stats.thermal.balance.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) }}
                </div>
              </div>
            </div>
          </LoadingState>
        </div>
      </div>
    </LoadingState>
  </div>
</template>
