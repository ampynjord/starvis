<script setup lang="ts">
import LoadingState from '@/components/LoadingState.vue'
import { getManufacturers, type Manufacturer } from '@/services/api'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const manufacturers = ref<(Manufacturer & { ship_count?: number; component_count?: number })[]>([])
const loading = ref(true)
const filter = ref<'all' | 'ships' | 'components'>('all')

// Readable names for generic P4K category codes
const CODE_DISPLAY_NAMES: Record<string, string> = {
  'COOL': 'Coolers (Generic)',
  'HTNK': 'Hydrogen Fuel Tanks',
  'INTK': 'Fuel Intakes',
  'POWR': 'Power Plants (Generic)',
  'QDRV': 'Quantum Drives (Generic)',
  'QTNK': 'Quantum Fuel Tanks',
  'RADR': 'Radars (Generic)',
  'SHLD': 'Shields (Generic)',
  'MISL': 'Missiles (Generic)',
  'GMISL': 'Guided Missiles',
  'LFSP': 'Life Support',
  'WEP': 'Weapons (Generic)',
  'BOMB': 'Bombs',
  'ASAD': 'ASAD Systems',
  'INNK': 'INNK Systems',
}
// Manufacturers to hide (no real data)
const HIDDEN_CODES = new Set(['NONE', 'AMBX', 'GMRCK', 'MRCK'])

function displayName(m: Manufacturer & { ship_count?: number; component_count?: number }): string {
  if (m.name && m.name !== m.code) return m.name
  return CODE_DISPLAY_NAMES[m.code] || m.code
}

onMounted(async () => {
  try {
    const res = await getManufacturers()
    manufacturers.value = (res.data || [])
      .filter((m: any) => !HIDDEN_CODES.has(m.code) && ((m.ship_count || 0) + (m.component_count || 0) > 0))
      .sort((a: any, b: any) => (b.ship_count || 0) + (b.component_count || 0) - (a.ship_count || 0) - (a.component_count || 0))
  } finally {
    loading.value = false
  }
})

const filteredManufacturers = computed(() => {
  if (filter.value === 'ships') return manufacturers.value.filter((m: any) => m.ship_count > 0)
  if (filter.value === 'components') return manufacturers.value.filter((m: any) => m.component_count > 0 && !m.ship_count)
  return manufacturers.value
})

function goToManufacturer(code: string, hasShips: boolean) {
  if (hasShips) router.push(`/ships?manufacturer=${code}`)
  else router.push(`/components?manufacturer=${code}`)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="section-title">Manufacturers</h1>
      <span class="text-sv-muted text-xs">{{ filteredManufacturers.length }} manufacturers</span>
    </div>

    <!-- Filter tabs -->
    <div class="flex gap-1">
      <button @click="filter = 'all'"
        class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
        :class="filter === 'all' ? 'bg-sv-accent/20 text-sv-accent border border-sv-accent/30' : 'text-sv-muted hover:text-sv-text'">
        All
      </button>
      <button @click="filter = 'ships'"
        class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
        :class="filter === 'ships' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-sv-muted hover:text-sv-text'">
        Ship Manufacturers
      </button>
      <button @click="filter = 'components'"
        class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
        :class="filter === 'components' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-sv-muted hover:text-sv-text'">
        Component Manufacturers
      </button>
    </div>

    <LoadingState :loading="loading">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div
          v-for="m in filteredManufacturers"
          :key="m.code"
          class="card-hover group cursor-pointer p-4"
          @click="goToManufacturer(m.code, !!(m as any).ship_count)"
        >
          <div class="flex items-start justify-between">
            <div class="min-w-0">
              <h3 class="font-semibold text-sv-text-bright text-sm group-hover:text-sv-accent transition-colors">
                {{ displayName(m) }}
              </h3>
              <span class="text-[11px] text-sv-muted font-mono">{{ m.code }}</span>
            </div>
            <div class="flex flex-col items-end gap-1 ml-2 shrink-0">
              <span v-if="(m as any).ship_count" class="badge-blue text-[10px]">
                {{ (m as any).ship_count }} ship{{ (m as any).ship_count > 1 ? 's' : '' }}
              </span>
              <!-- Only show component badge on component-only manufacturers -->
              <span v-if="(m as any).component_count && !(m as any).ship_count" class="badge-green text-[10px]">
                {{ (m as any).component_count }} component{{ (m as any).component_count > 1 ? 's' : '' }}
              </span>
            </div>
          </div>
          <p v-if="m.description" class="text-xs text-sv-muted mt-2 line-clamp-2">{{ m.description }}</p>
          <p v-if="m.known_for" class="text-[10px] text-sv-accent/70 mt-1">{{ m.known_for }}</p>
        </div>
      </div>
    </LoadingState>
  </div>
</template>
