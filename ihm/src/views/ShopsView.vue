<script setup lang="ts">
import LoadingState from '@/components/LoadingState.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import { getShopInventory, getShops, type Shop } from '@/services/api'
import { onMounted, ref, watch } from 'vue'

const shops = ref<Shop[]>([])
const total = ref(0)
const page = ref(1)
const pages = ref(1)
const loading = ref(true)

const search = ref('')

const selectedShop = ref<Shop | null>(null)
const inventory = ref<any[]>([])
const loadingInventory = ref(false)

async function fetchShops() {
  loading.value = true
  try {
    const params: Record<string, string> = { page: String(page.value), limit: '30' }
    if (search.value) params.search = search.value
    const res = await getShops(params)
    shops.value = res.data
    total.value = res.total
    pages.value = Math.ceil(res.total / 30)
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
  if (typeof v === 'number') return v.toLocaleString('fr-FR')
  return v
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold text-sc-text-bright">🏪 Boutiques</h1>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Shop list -->
      <div class="lg:col-span-1 space-y-3">
        <input v-model="search" class="input w-full" placeholder="Rechercher une boutique…" />

        <LoadingState :loading="loading">
          <div class="space-y-1 max-h-[70vh] overflow-y-auto pr-1">
            <div
              v-for="shop in shops"
              :key="shop.id"
              class="card px-3 py-2 cursor-pointer transition-colors"
              :class="selectedShop?.id === shop.id ? 'border-sc-accent bg-sc-accent/10' : 'hover:border-sc-accent/30'"
              @click="selectShop(shop)"
            >
              <div class="font-medium text-sc-text-bright text-sm">{{ shop.name }}</div>
              <div class="text-xs text-sc-muted">
                {{ [shop.parent_location, shop.location].filter(Boolean).join(' · ') }}
              </div>
              <span v-if="shop.shop_type" class="badge-blue text-xs mt-1">{{ shop.shop_type }}</span>
            </div>
          </div>
        </LoadingState>

        <PaginationBar :page="page" :pages="pages" :total="total" @update:page="page = $event" />
      </div>

      <!-- Inventory -->
      <div class="lg:col-span-2">
        <div v-if="!selectedShop" class="card p-8 text-center text-sc-muted">
          Sélectionnez une boutique pour voir son inventaire
        </div>
        <div v-else class="card p-4">
          <h2 class="text-lg font-semibold text-sc-text-bright mb-1">{{ selectedShop.name }}</h2>
          <p class="text-sm text-sc-muted mb-4">
            {{ [selectedShop.parent_location, selectedShop.location].filter(Boolean).join(' · ') }}
          </p>

          <LoadingState :loading="loadingInventory">
            <div v-if="inventory.length === 0" class="text-sc-muted text-center py-8">Inventaire vide</div>
            <div v-else class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="text-left text-sc-muted border-b border-sc-border">
                  <tr>
                    <th class="py-2 px-3">Composant</th>
                    <th class="py-2 px-3">Type</th>
                    <th class="py-2 px-3 text-center">Taille</th>
                    <th class="py-2 px-3 text-right">Prix</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in inventory"
                    :key="item.component_uuid"
                    class="border-b border-sc-border/30 hover:bg-sc-border/10"
                  >
                    <td class="py-2 px-3">
                      <router-link :to="`/components/${item.component_class_name || item.component_uuid}`" class="text-sc-accent hover:underline">
                        {{ item.component_name }}
                      </router-link>
                    </td>
                    <td class="py-2 px-3 text-sc-muted">{{ item.component_type }}</td>
                    <td class="py-2 px-3 text-center">S{{ item.component_size }}</td>
                    <td class="py-2 px-3 text-right font-semibold text-sc-gold">{{ fmt(item.base_price) }} aUEC</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </LoadingState>
        </div>
      </div>
    </div>
  </div>
</template>
