<script setup lang="ts">
import LoadingState from '@/components/LoadingState.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import { getShopInventory, getShops, type Shop } from '@/services/api'
import { computed, onMounted, ref, watch } from 'vue'

const shops = ref<Shop[]>([])
const total = ref(0)
const page = ref(1)
const pages = ref(1)
const loading = ref(true)

const search = ref('')
const typeFilter = ref('')

const selectedShop = ref<Shop | null>(null)
const inventory = ref<any[]>([])
const loadingInventory = ref(false)

// Unique shop types for filter tabs
const shopTypes = computed(() => {
  const types = new Set(shops.value.map(s => s.shop_type).filter(Boolean))
  return Array.from(types).sort()
})

const filteredShops = computed(() => {
  if (!typeFilter.value) return shops.value
  return shops.value.filter(s => s.shop_type === typeFilter.value)
})

async function fetchShops() {
  loading.value = true
  try {
    const params: Record<string, string> = { page: String(page.value), limit: '100' }
    if (search.value) params.search = search.value
    const res = await getShops(params)
    shops.value = res.data
    total.value = res.total
    pages.value = Math.ceil(res.total / 100)
  } finally {
    loading.value = false
  }
}

async function selectShop(shop: Shop) {
  selectedShop.value = shop
  loadingInventory.value = true
  try {
    const res = await getShopInventory(shop.id)
    inventory.value = res.data || []
  } finally {
    loadingInventory.value = false
  }
}

onMounted(fetchShops)
watch([search], () => { page.value = 1; fetchShops() })
watch(page, fetchShops)

function fmt(v: any) {
  if (v == null || v === 0) return '—'
  if (typeof v === 'number') return v.toLocaleString('en-US')
  return v
}

function shopIcon(type: string | null): string {
  if (!type) return '🏪'
  const t = type.toLowerCase()
  if (t.includes('weapon')) return '🔫'
  if (t.includes('armor') || t.includes('clothing')) return '🛡️'
  if (t.includes('ship') || t.includes('vehicle')) return '🚀'
  if (t.includes('component')) return '⚙️'
  if (t.includes('commodity') || t.includes('trade')) return '📦'
  if (t.includes('food') || t.includes('drink')) return '🍔'
  return '🏪'
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="section-title">Shops</h1>
      <span class="text-sv-muted text-xs">{{ total }} shops found</span>
    </div>

    <!-- Info banner -->
    <div class="card p-3 border-amber-500/20 bg-amber-500/5">
      <div class="flex items-start gap-2">
        <span class="text-amber-400 shrink-0">⚠</span>
        <div class="text-xs text-sv-muted">
          <span class="text-amber-400 font-medium">Limited data</span> — Shop definitions are extracted from game files (P4K), but inventory and pricing data is server-managed and cannot be extracted. Only shop types and names are available.
        </div>
      </div>
    </div>

    <!-- Type filter tabs -->
    <div class="flex gap-1 flex-wrap" v-if="shopTypes.length > 0">
      <button @click="typeFilter = ''"
        class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
        :class="!typeFilter ? 'bg-sv-accent/20 text-sv-accent border border-sv-accent/30' : 'text-sv-muted hover:text-sv-text'">
        All ({{ shops.length }})
      </button>
      <button v-for="t in shopTypes" :key="t!" @click="typeFilter = t || ''"
        class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
        :class="typeFilter === t ? 'bg-sv-accent/20 text-sv-accent border border-sv-accent/30' : 'text-sv-muted hover:text-sv-text'">
        {{ shopIcon(t) }} {{ t }} ({{ shops.filter(s => s.shop_type === t).length }})
      </button>
    </div>

    <input v-model="search" class="input w-full" placeholder="Search a shop…" />

    <LoadingState :loading="loading">
      <div v-if="filteredShops.length === 0" class="card p-8 text-center text-sv-muted text-sm">
        No shops found
      </div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div
          v-for="shop in filteredShops"
          :key="shop.id"
          class="card-hover group p-4 cursor-pointer"
          @click="selectShop(shop)"
          :class="selectedShop?.id === shop.id ? 'border-sv-accent bg-sv-accent/10' : ''"
        >
          <div class="flex items-start gap-3">
            <div class="text-2xl opacity-60">{{ shopIcon(shop.shop_type) }}</div>
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-sv-text-bright text-sm group-hover:text-sv-accent transition-colors">
                {{ shop.name }}
              </h3>
              <div class="text-[10px] text-sv-muted mt-0.5">
                {{ [shop.parent_location, shop.location].filter(Boolean).join(' · ') || 'Location unknown' }}
              </div>
              <div class="flex items-center gap-2 mt-1.5">
                <span v-if="shop.shop_type" class="badge-blue text-[10px]">{{ shop.shop_type }}</span>
                <span class="text-[10px] text-sv-muted/50 font-mono">{{ shop.class_name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <PaginationBar v-if="pages > 1" :page="page" :pages="pages" :total="total" @update:page="page = $event" />
    </LoadingState>

    <!-- Inventory detail modal-like panel -->
    <div v-if="selectedShop" class="card p-4">
      <div class="flex items-center justify-between mb-3">
        <div>
          <h2 class="text-sm font-semibold text-sv-text-bright">{{ shopIcon(selectedShop.shop_type) }} {{ selectedShop.name }}</h2>
          <p class="text-xs text-sv-muted">
            {{ [selectedShop.parent_location, selectedShop.location].filter(Boolean).join(' · ') || 'Location unknown' }}
          </p>
        </div>
        <button @click="selectedShop = null" class="text-sv-muted hover:text-sv-text text-xs">✕ Close</button>
      </div>

      <LoadingState :loading="loadingInventory">
        <div v-if="inventory.length === 0" class="text-sv-muted text-center py-6 text-sm">
          <div class="text-3xl opacity-30 mb-2">📦</div>
          <p>No inventory data available</p>
          <p class="text-[10px] mt-1">Shop inventory is server-managed and not available from game files</p>
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="text-left text-sv-muted border-b border-sv-border">
              <tr>
                <th class="py-1.5 px-2.5">Component</th>
                <th class="py-1.5 px-2.5">Type</th>
                <th class="py-1.5 px-2.5 text-center">Size</th>
                <th class="py-1.5 px-2.5 text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in inventory"
                :key="item.component_uuid"
                class="border-b border-sv-border/20 hover:bg-sv-panel-light/30"
              >
                <td class="py-1.5 px-2.5">
                  <router-link :to="`/components/${item.component_class_name || item.component_uuid}`" class="text-sv-accent hover:underline">
                    {{ item.component_name }}
                  </router-link>
                </td>
                <td class="py-1.5 px-2.5 text-sv-muted">{{ item.component_type }}</td>
                <td class="py-1.5 px-2.5 text-center">S{{ item.component_size }}</td>
                <td class="py-1.5 px-2.5 text-right font-semibold text-sv-gold">{{ fmt(item.base_price) }} aUEC</td>
              </tr>
            </tbody>
          </table>
        </div>
      </LoadingState>
    </div>
  </div>
</template>
