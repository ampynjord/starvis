<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getShips, getManufacturers, type Ship, type Manufacturer } from '@/services/api'
import LoadingState from '@/components/LoadingState.vue'
import PaginationBar from '@/components/PaginationBar.vue'

const router = useRouter()
const ships = ref<Ship[]>([])
const total = ref(0)
const page = ref(1)
const pages = ref(1)
const loading = ref(true)
const manufacturers = ref<Manufacturer[]>([])

// Filters
const search = ref('')
const manufacturer = ref('')
const sort = ref('name')
const order = ref<'asc' | 'desc'>('asc')

async function fetchShips() {
  loading.value = true
  try {
    const params: Record<string, string> = {
      page: String(page.value),
      limit: '30',
      sort: sort.value,
      order: order.value,
    }
    if (search.value) params.search = search.value
    if (manufacturer.value) params.manufacturer = manufacturer.value
    const res = await getShips(params)
    ships.value = res.data
    total.value = res.total
    pages.value = Math.ceil(res.total / 30)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  const [, mfg] = await Promise.all([
    fetchShips(),
    getManufacturers().catch(() => ({ data: [] })),
  ])
  manufacturers.value = mfg.data
})

watch([search, manufacturer, sort, order], () => { page.value = 1; fetchShips() })
watch(page, fetchShips)

function fmt(v: any) {
  if (v == null) return '—'
  if (typeof v === 'number') return v.toLocaleString('fr-FR')
  return v
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-sc-text-bright">🚀 Vaisseaux</h1>
      <span class="text-sc-muted text-sm">{{ total }} vaisseaux</span>
    </div>

    <!-- Filters -->
    <div class="card p-4 flex flex-wrap gap-3">
      <input v-model="search" class="input flex-1 min-w-[200px]" placeholder="Rechercher…" />
      <select v-model="manufacturer" class="input w-40">
        <option value="">Tous fabricants</option>
        <option v-for="m in manufacturers" :key="m.code" :value="m.code">{{ m.code }}</option>
      </select>
      <select v-model="sort" class="input w-36">
        <option value="name">Nom</option>
        <option value="mass">Masse</option>
        <option value="scm_speed">SCM Speed</option>
        <option value="max_speed">Max Speed</option>
        <option value="total_hp">HP</option>
        <option value="cargo_capacity">Cargo</option>
      </select>
      <button @click="order = order === 'asc' ? 'desc' : 'asc'" class="btn-ghost px-3">
        {{ order === 'asc' ? '↑' : '↓' }}
      </button>
    </div>

    <LoadingState :loading="loading">
      <!-- Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div
          v-for="ship in ships"
          :key="ship.uuid"
          class="card p-4 cursor-pointer hover:border-sc-accent/50 transition-colors"
          @click="router.push(`/ships/${ship.class_name || ship.uuid}`)"
        >
          <div class="flex items-start justify-between mb-2">
            <div>
              <h3 class="font-semibold text-sc-text-bright">{{ ship.name }}</h3>
              <span class="text-xs text-sc-muted">{{ ship.manufacturer_code }}</span>
            </div>
            <span v-if="ship.ship_matrix_id" class="badge-green">RSI</span>
          </div>
          <div class="grid grid-cols-3 gap-2 text-xs">
            <div><span class="text-sc-muted">HP</span><br />{{ fmt(ship.total_hp) }}</div>
            <div><span class="text-sc-muted">Masse</span><br />{{ fmt(Math.round(ship.mass)) }} kg</div>
            <div><span class="text-sc-muted">SCM</span><br />{{ fmt(ship.scm_speed) }} m/s</div>
          </div>
          <div class="flex gap-2 mt-2">
            <span v-if="ship.career" class="badge-blue">{{ ship.career }}</span>
            <span v-if="ship.role" class="badge-amber">{{ ship.role }}</span>
          </div>
        </div>
      </div>
    </LoadingState>

    <PaginationBar :page="page" :pages="pages" :total="total" @update:page="page = $event" />
  </div>
</template>
