<script setup lang="ts">
import LoadingState from '@/components/LoadingState.vue'
import { getManufacturers, getShips, type Manufacturer } from '@/services/api'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const manufacturers = ref<(Manufacturer & { ship_count?: number })[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const [mfgRes, shipsRes] = await Promise.all([
      getManufacturers(),
      getShips({ limit: '1000' }),
    ])
    // Count ships per manufacturer
    const counts: Record<string, number> = {}
    for (const s of shipsRes.data) {
      const code = s.manufacturer_code
      counts[code] = (counts[code] || 0) + 1
    }
    manufacturers.value = (mfgRes.data || [])
      .map((m: Manufacturer) => ({ ...m, ship_count: counts[m.code] || 0 }))
      .sort((a: any, b: any) => b.ship_count - a.ship_count)
  } finally {
    loading.value = false
  }
})

function goToShips(code: string) {
  router.push(`/ships?manufacturer=${code}`)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="section-title">Fabricants</h1>
      <span class="text-sv-muted text-xs">{{ manufacturers.length }} fabricants</span>
    </div>

    <LoadingState :loading="loading">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div
          v-for="m in manufacturers"
          :key="m.code"
          class="card-hover group cursor-pointer p-4"
          @click="goToShips(m.code)"
        >
          <div class="flex items-start justify-between">
            <div class="min-w-0">
              <h3 class="font-semibold text-sv-text-bright text-sm group-hover:text-sv-accent transition-colors">
                {{ m.name || m.code }}
              </h3>
              <span class="text-[11px] text-sv-muted font-mono">{{ m.code }}</span>
            </div>
            <span v-if="m.ship_count" class="badge-blue text-[10px] ml-2 shrink-0">
              {{ m.ship_count }} vaisseau{{ (m.ship_count || 0) > 1 ? 'x' : '' }}
            </span>
          </div>
          <p v-if="m.description" class="text-xs text-sv-muted mt-2 line-clamp-2">{{ m.description }}</p>
          <p v-if="m.known_for" class="text-[10px] text-sv-accent/70 mt-1">{{ m.known_for }}</p>
        </div>
      </div>
    </LoadingState>
  </div>
</template>
