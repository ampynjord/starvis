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
    <h1 class="section-title">Boutiques</h1>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <!-- Shop list -->
      <div class="lg:col-span-1 space-y-2">
        <input v-model="search" class="input w-full" placeholder="Rechercher une boutique…" />

        <LoadingState :loading="loading">
          <div class="space-y-1 max-h-[70vh] overflow-y-auto pr-1">
            <div
              v-for="shop in shops"
              :key="shop.id"
              class="card px-2.5 py-1.5 cursor-pointer transition-colors"
              :class="selectedShop?.id === shop.id ? 'border-sv-accent bg-sv-accent/10' : 'hover:border-sv-accent/30'"
              @click="selectShop(shop)"
            >
              <div class="font-medium text-sv-text-bright text-xs">{{ shop.name }}</div>
              <div class="text-[10px] text-sv-muted">
                {{ [shop.parent_location, shop.location].filter(Boolean).join(' · ') }}
              </div>
              <span v-if="shop.shop_type" class="badge-blue text-[10px] mt-0.5">{{ shop.shop_type }}</span>
            </div>
          </div>
        </LoadingState>

        <PaginationBar :page="page" :pages="pages" :total="total" @update:page="page = $event" />
      </div>

      <!-- Inventory -->
      <div class="lg:col-span-2">
        <div v-if="!selectedShop" class="card p-8 text-center text-sv-muted text-sm">
          Sélectionnez une boutique pour voir son inventaire
        </div>
        <div v-else class="card p-4">
          <h2 class="text-sm font-semibold text-sv-text-bright mb-0.5">{{ selectedShop.name }}</h2>
          <p class="text-xs text-sv-muted mb-3">
            {{ [selectedShop.parent_location, selectedShop.location].filter(Boolean).join(' · ') }}
          </p>

          <LoadingState :loading="loadingInventory">
            <div v-if="inventory.length === 0" class="text-sv-muted text-center py-8 text-sm">Inventaire vide</div>
            <div v-else class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead class="text-left text-sv-muted border-b border-sv-border">
                  <tr>
                    <th class="py-1.5 px-2.5">Composant</th>
                    <th class="py-1.5 px-2.5">Type</th>
                    <th class="py-1.5 px-2.5 text-center">Taille</th>
                    <th class="py-1.5 px-2.5 text-right">Prix</th>
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
    </div>
  </div>
</template>
