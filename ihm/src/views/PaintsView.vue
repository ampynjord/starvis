<script setup lang="ts">
import LoadingState from '@/components/LoadingState.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import { getPaints, type Paint } from '@/services/api'
import { debounce } from '@/utils/formatters'
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const paints = ref<Paint[]>([])
const total = ref(0)
const page = ref(1)
const pages = ref(1)
const loading = ref(true)
const error = ref('')

const search = ref('')

async function fetchPaints() {
  loading.value = true
  error.value = ''
  try {
    const params: Record<string, string> = {
      page: String(page.value),
      limit: '50',
    }
    if (search.value) params.search = search.value
    const res = await getPaints(params)
    paints.value = res.data
    total.value = res.total
    pages.value = Math.ceil(res.total / 50)
  } catch (e: any) {
    error.value = e.message || 'Failed to load paints'
  } finally {
    loading.value = false
  }
}

onMounted(fetchPaints)
const debouncedFetch = debounce(() => { page.value = 1; fetchPaints() }, 300)
watch(search, debouncedFetch)
watch(page, fetchPaints)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="section-title">Paints</h1>
      <span class="text-sv-muted text-xs">{{ total.toLocaleString('en-US') }} results</span>
    </div>

    <!-- Filters -->
    <div class="card p-3 flex flex-wrap gap-2">
      <input v-model="search" class="input flex-1 min-w-[200px]" placeholder="Search by paint or ship name…" />
    </div>

    <!-- Error -->
    <div v-if="error" class="card border-red-500/50 p-3 text-red-400 text-sm">{{ error }}</div>

    <LoadingState :loading="loading">
      <div v-if="paints.length === 0" class="card p-8 text-center text-sv-muted text-sm">
        No paints found
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead class="text-left text-sv-muted border-b border-sv-border">
            <tr>
              <th class="py-2 px-2.5">Paint</th>
              <th class="py-2 px-2.5">Ship</th>
              <th class="py-2 px-2.5">Manufacturer</th>
              <th class="py-2 px-2.5">Class Name</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="paint in paints"
              :key="paint.id"
              class="border-b border-sv-border/30 hover:bg-sv-panel-light/40 transition-colors"
            >
              <td class="py-1.5 px-2.5">
                <div class="flex items-center gap-2">
                  <span class="text-base opacity-50">🎨</span>
                  <span class="font-medium text-sv-text-bright">{{ paint.paint_name || paint.paint_class_name }}</span>
                </div>
              </td>
              <td class="py-1.5 px-2.5">
                <router-link
                  v-if="paint.ship_class_name"
                  :to="`/ships/${paint.ship_class_name}`"
                  class="text-sv-accent hover:underline"
                >
                  {{ paint.ship_name || paint.ship_uuid }}
                </router-link>
                <span v-else class="text-sv-muted">—</span>
              </td>
              <td class="py-1.5 px-2.5 text-sv-muted">{{ paint.manufacturer_name || paint.manufacturer_code || '—' }}</td>
              <td class="py-1.5 px-2.5 text-sv-muted/50 font-mono text-[10px]">{{ paint.paint_class_name }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </LoadingState>

    <PaginationBar :page="page" :pages="pages" :total="total" @update:page="page = $event" />
  </div>
</template>
