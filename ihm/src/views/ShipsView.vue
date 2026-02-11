<script setup lang="ts">
import LoadingState from '@/components/LoadingState.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import { getManufacturers, getShips, type Manufacturer, type Ship } from '@/services/api'
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

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
      <h1 class="section-title">Vaisseaux</h1>
      <span class="text-sv-muted text-xs">{{ total.toLocaleString('fr-FR') }} résultats</span>
    </div>

    <!-- Filters -->
    <div class="card p-3 flex flex-wrap gap-2">
      <input v-model="search" class="input flex-1 min-w-[180px]" placeholder="Rechercher un vaisseau…" />
      <select v-model="manufacturer" class="input w-36">
        <option value="">Tous fabricants</option>
        <option v-for="m in manufacturers" :key="m.code" :value="m.code">{{ m.code }}</option>
      </select>
      <select v-model="sort" class="input w-32">
        <option value="name">Nom</option>
        <option value="mass">Masse</option>
        <option value="scm_speed">Vitesse SCM</option>
        <option value="max_speed">Vitesse max</option>
        <option value="total_hp">HP total</option>
        <option value="cargo_capacity">Cargo</option>
      </select>
      <button @click="order = order === 'asc' ? 'desc' : 'asc'" class="btn-ghost px-2.5 text-sm">
        {{ order === 'asc' ? '↑ Asc' : '↓ Desc' }}
      </button>
    </div>

    <LoadingState :loading="loading">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div
          v-for="ship in ships"
          :key="ship.uuid"
          class="card-hover group cursor-pointer overflow-hidden"
          @click="router.push(`/ships/${ship.class_name || ship.uuid}`)"
        >
          <!-- Thumbnail -->
          <div class="relative h-32 bg-sv-darker overflow-hidden">
            <img
              v-if="(ship as any).thumbnail"
              :src="(ship as any).thumbnail"
              :alt="ship.name"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
            <div v-else class="thumb-placeholder h-full flex items-center justify-center">
              <span class="text-3xl opacity-30">🚀</span>
            </div>
            <!-- Status badge -->
            <div class="absolute top-2 right-2 flex gap-1">
              <span v-if="(ship as any).production_status" class="text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-sv-muted backdrop-blur-sm">
                {{ (ship as any).production_status }}
              </span>
            </div>
          </div>

          <!-- Content -->
          <div class="p-3">
            <div class="flex items-start justify-between mb-1.5">
              <div class="min-w-0">
                <h3 class="font-semibold text-sv-text-bright text-sm truncate group-hover:text-sv-accent transition-colors">
                  {{ ship.name }}
                </h3>
                <span class="text-[11px] text-sv-muted">{{ ship.manufacturer_code }}</span>
              </div>
              <span v-if="ship.ship_matrix_id" class="badge-green text-[10px] ml-2 shrink-0">RSI</span>
            </div>

            <div class="grid grid-cols-3 gap-1.5 text-[11px] mt-2">
              <div class="text-center p-1 rounded bg-sv-darker/50">
                <div class="text-sv-muted mb-0.5">HP</div>
                <div class="text-sv-text font-medium">{{ fmt(ship.total_hp) }}</div>
              </div>
              <div class="text-center p-1 rounded bg-sv-darker/50">
                <div class="text-sv-muted mb-0.5">Masse</div>
                <div class="text-sv-text font-medium">{{ fmt(Math.round(ship.mass)) }}</div>
              </div>
              <div class="text-center p-1 rounded bg-sv-darker/50">
                <div class="text-sv-muted mb-0.5">SCM</div>
                <div class="text-sv-text font-medium">{{ fmt(ship.scm_speed) }}</div>
              </div>
            </div>

            <div class="flex gap-1.5 mt-2" v-if="ship.career || ship.role">
              <span v-if="ship.career" class="badge-blue text-[10px]">{{ ship.career }}</span>
              <span v-if="ship.role" class="badge-amber text-[10px]">{{ ship.role }}</span>
            </div>
          </div>
        </div>
      </div>
    </LoadingState>

    <PaginationBar :page="page" :pages="pages" :total="total" @update:page="page = $event" />
  </div>
</template>
