<script setup lang="ts">
import LoadingState from '@/components/LoadingState.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import { getComponents, getManufacturers, type Component, type Manufacturer } from '@/services/api'
import { COMPONENT_TYPES } from '@/utils/constants'
import { debounce, fmt } from '@/utils/formatters'
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const components = ref<Component[]>([])
const total = ref(0)
const page = ref(1)
const pages = ref(1)
const loading = ref(true)
const error = ref('')
const manufacturers = ref<Manufacturer[]>([])

const TYPES = COMPONENT_TYPES

// Filters — initialize from route query params
const search = ref((route.query.search as string) || '')
const type = ref((route.query.type as string) || '')
const size = ref((route.query.size as string) || '')
const manufacturer = ref((route.query.manufacturer as string) || '')
const sort = ref('name')
const order = ref<'asc' | 'desc'>('asc')

async function fetchComponents() {
  loading.value = true
  error.value = ''
  try {
    const params: Record<string, string> = {
      page: String(page.value),
      limit: '30',
      sort: sort.value,
      order: order.value,
    }
    if (search.value) params.search = search.value
    if (type.value) params.type = type.value
    if (size.value) params.size = size.value
    if (manufacturer.value) params.manufacturer = manufacturer.value
    const res = await getComponents(params)
    components.value = res.data
    total.value = res.total
    pages.value = Math.ceil(res.total / 30)
  } catch (e: any) {
    error.value = e.message || 'Failed to load components'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  const [, mfg] = await Promise.all([
    fetchComponents(),
    getManufacturers().catch(() => ({ data: [] })),
  ])
  manufacturers.value = mfg.data
})

const debouncedFetch = debounce(() => { page.value = 1; fetchComponents() }, 300)
watch(search, debouncedFetch)
watch([type, size, manufacturer, sort, order], () => { page.value = 1; fetchComponents() })
watch(page, fetchComponents)

// fmt imported from @/utils/formatters

function typeColor(t: string) {
  const colors: Record<string, string> = {
    WeaponGun: 'badge-red', WeaponMissile: 'badge-red', Shield: 'badge-blue',
    QuantumDrive: 'badge-amber', PowerPlant: 'badge-green', Cooler: 'badge-blue',
    Turret: 'badge-red', TurretBase: 'badge-red', MissileLauncher: 'badge-red',
  }
  return colors[t] || 'badge-blue'
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="section-title">Components</h1>
      <span class="text-sv-muted text-xs">{{ total.toLocaleString('en-US') }} results</span>
    </div>

    <!-- Filters -->
    <div class="card p-3 flex flex-wrap gap-2">
      <input v-model="search" class="input flex-1 min-w-[160px]" placeholder="Search a component…" />
      <select v-model="type" class="input w-36">
        <option value="">All types</option>
        <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
      </select>
      <select v-model="size" class="input w-20">
        <option value="">Size</option>
        <option v-for="s in [0,1,2,3,4,5,6,7,8,9,10]" :key="s" :value="String(s)">S{{ s }}</option>
      </select>
      <select v-model="manufacturer" class="input w-32">
        <option value="">Manufacturer</option>
        <option v-for="m in manufacturers" :key="m.code" :value="m.code">{{ m.name || m.code }}</option>
      </select>
      <select v-model="sort" class="input w-28">
        <option value="name">Name</option>
        <option value="hp">HP</option>
        <option value="weapon_dps">DPS</option>
        <option value="shield_hp">Shield HP</option>
        <option value="mass">Mass</option>
      </select>
      <button @click="order = order === 'asc' ? 'desc' : 'asc'" class="btn-ghost px-2.5 text-sm">
        {{ order === 'asc' ? '↑ Asc' : '↓ Desc' }}
      </button>
    </div>

    <!-- Error -->
    <div v-if="error" class="card border-red-500/50 p-3 text-red-400 text-sm">{{ error }}</div>

    <LoadingState :loading="loading">
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead class="text-left text-sv-muted border-b border-sv-border">
            <tr>
              <th class="py-2 px-2.5">Name</th>
              <th class="py-2 px-2.5">Type</th>
              <th class="py-2 px-2.5 text-center">Size</th>
              <th class="py-2 px-2.5">Grade</th>
              <th class="py-2 px-2.5 text-right">HP</th>
              <th class="py-2 px-2.5 text-right">DPS</th>
              <th class="py-2 px-2.5 text-right">Shield</th>
              <th class="py-2 px-2.5">Manufacturer</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in components"
              :key="c.uuid"
              class="border-b border-sv-border/30 hover:bg-sv-panel-light/40 cursor-pointer transition-colors"
              @click="router.push(`/components/${c.class_name || c.uuid}`)"
            >
              <td class="py-1.5 px-2.5 font-medium text-sv-text-bright">{{ c.name }}</td>
              <td class="py-1.5 px-2.5"><span :class="typeColor(c.type)" class="text-[10px]">{{ c.type }}</span></td>
              <td class="py-1.5 px-2.5 text-center text-sv-muted">S{{ c.size }}</td>
              <td class="py-1.5 px-2.5 text-sv-muted">{{ c.grade || '—' }}</td>
              <td class="py-1.5 px-2.5 text-right">{{ fmt(c.hp) }}</td>
              <td class="py-1.5 px-2.5 text-right">{{ fmt(c.weapon_dps) }}</td>
              <td class="py-1.5 px-2.5 text-right">{{ fmt(c.shield_hp) }}</td>
              <td class="py-1.5 px-2.5 text-sv-muted">{{ c.manufacturer_code }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </LoadingState>

    <PaginationBar :page="page" :pages="pages" :total="total" @update:page="page = $event" />
  </div>
</template>
