<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getComponents, getManufacturers, type Component, type Manufacturer } from '@/services/api'
import LoadingState from '@/components/LoadingState.vue'
import PaginationBar from '@/components/PaginationBar.vue'

const router = useRouter()
const components = ref<Component[]>([])
const total = ref(0)
const page = ref(1)
const pages = ref(1)
const loading = ref(true)
const manufacturers = ref<Manufacturer[]>([])

const TYPES = [
  'WeaponGun', 'WeaponMissile', 'Shield', 'QuantumDrive', 'PowerPlant',
  'Cooler', 'Turret', 'TurretBase', 'MissileLauncher', 'Armor',
  'WeaponMining', 'Radar',
]

// Filters
const search = ref('')
const type = ref('')
const size = ref('')
const manufacturer = ref('')
const sort = ref('name')
const order = ref<'asc' | 'desc'>('asc')

async function fetchComponents() {
  loading.value = true
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

watch([search, type, size, manufacturer, sort, order], () => { page.value = 1; fetchComponents() })
watch(page, fetchComponents)

function fmt(v: any) {
  if (v == null || v === 0) return '—'
  if (typeof v === 'number') return v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
  return v
}

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
      <h1 class="text-2xl font-bold text-sc-text-bright">⚙️ Composants</h1>
      <span class="text-sc-muted text-sm">{{ total }} composants</span>
    </div>

    <!-- Filters -->
    <div class="card p-4 flex flex-wrap gap-3">
      <input v-model="search" class="input flex-1 min-w-[180px]" placeholder="Rechercher…" />
      <select v-model="type" class="input w-40">
        <option value="">Tous types</option>
        <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
      </select>
      <select v-model="size" class="input w-24">
        <option value="">Taille</option>
        <option v-for="s in [0,1,2,3,4,5,6,7,8,9,10]" :key="s" :value="String(s)">S{{ s }}</option>
      </select>
      <select v-model="manufacturer" class="input w-36">
        <option value="">Fabricant</option>
        <option v-for="m in manufacturers" :key="m.code" :value="m.code">{{ m.code }}</option>
      </select>
      <select v-model="sort" class="input w-32">
        <option value="name">Nom</option>
        <option value="hp">HP</option>
        <option value="weapon_dps">DPS</option>
        <option value="shield_hp">Shield HP</option>
        <option value="mass">Masse</option>
      </select>
      <button @click="order = order === 'asc' ? 'desc' : 'asc'" class="btn-ghost px-3">
        {{ order === 'asc' ? '↑' : '↓' }}
      </button>
    </div>

    <LoadingState :loading="loading">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-sc-muted border-b border-sc-border">
            <tr>
              <th class="py-2 px-3">Nom</th>
              <th class="py-2 px-3">Type</th>
              <th class="py-2 px-3 text-center">Taille</th>
              <th class="py-2 px-3">Grade</th>
              <th class="py-2 px-3 text-right">HP</th>
              <th class="py-2 px-3 text-right">DPS</th>
              <th class="py-2 px-3 text-right">Bouclier</th>
              <th class="py-2 px-3">Fabricant</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in components"
              :key="c.uuid"
              class="border-b border-sc-border/50 hover:bg-sc-border/20 cursor-pointer transition-colors"
              @click="router.push(`/components/${c.class_name || c.uuid}`)"
            >
              <td class="py-2 px-3 font-medium text-sc-text-bright">{{ c.name }}</td>
              <td class="py-2 px-3"><span :class="typeColor(c.type)">{{ c.type }}</span></td>
              <td class="py-2 px-3 text-center">S{{ c.size }}</td>
              <td class="py-2 px-3">{{ c.grade || '—' }}</td>
              <td class="py-2 px-3 text-right">{{ fmt(c.hp) }}</td>
              <td class="py-2 px-3 text-right">{{ fmt(c.weapon_dps) }}</td>
              <td class="py-2 px-3 text-right">{{ fmt(c.shield_hp) }}</td>
              <td class="py-2 px-3 text-sc-muted">{{ c.manufacturer_code }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </LoadingState>

    <PaginationBar :page="page" :pages="pages" :total="total" @update:page="page = $event" />
  </div>
</template>
