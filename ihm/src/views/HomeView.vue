<script setup lang="ts">
import { getComponents, getManufacturers, getShips, getVersion } from '@/services/api'
import { onMounted, ref } from 'vue'

const stats = ref<any>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const [v, s, c, m] = await Promise.all([
      getVersion().catch(() => null),
      getShips({ limit: '1' }).catch(() => null),
      getComponents({ limit: '1' }).catch(() => null),
      getManufacturers().catch(() => null),
    ])
    stats.value = {
      ships: s?.total || 0,
      components: c?.total || 0,
      manufacturers: m?.count || 0,
      version: v?.data?.game_version || '?',
      lastExtraction: v?.data?.extracted_at || null,
    }
  } finally {
    loading.value = false
  }
})

const features = [
  { icon: '🚀', title: 'Vaisseaux', desc: '350+ vaisseaux jouables avec stats réelles', to: '/ships' },
  { icon: '🔧', title: 'Composants', desc: '2700+ composants en 12 types', to: '/components' },
  { icon: '⚖️', title: 'Comparer', desc: 'Comparaison côte à côte avec deltas', to: '/compare' },
  { icon: '🛒', title: 'Shops', desc: 'Magasins in-game, prix et locations', to: '/shops' },
  { icon: '🎯', title: 'Loadout', desc: 'Simulateur de loadout avec stats agrégées', to: '/loadout' },
  { icon: '📊', title: 'API REST', desc: 'API complète avec pagination, CSV, ETag', to: '/api-docs' },
]
</script>

<template>
  <div class="space-y-10">
    <!-- Hero -->
    <div class="text-center py-12">
      <h1 class="text-4xl font-bold text-sc-text-bright mb-3">
        ⭐ Starapi
      </h1>
      <p class="text-lg text-sc-muted max-w-2xl mx-auto">
        Base de données Star Citizen — Vaisseaux, composants, shops et loadouts
        <br />extraits directement des fichiers de jeu (P4K/DataForge)
      </p>
    </div>

    <!-- Stats overview -->
    <div v-if="stats" class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="card p-4 text-center">
        <div class="text-2xl font-bold text-sc-accent">{{ stats.ships }}</div>
        <div class="text-sc-muted text-sm">Vaisseaux</div>
      </div>
      <div class="card p-4 text-center">
        <div class="text-2xl font-bold text-emerald-400">{{ stats.components }}</div>
        <div class="text-sc-muted text-sm">Composants</div>
      </div>
      <div class="card p-4 text-center">
        <div class="text-2xl font-bold text-amber-400">{{ stats.manufacturers }}</div>
        <div class="text-sc-muted text-sm">Fabricants</div>
      </div>
      <div class="card p-4 text-center">
        <div class="text-2xl font-bold text-purple-400">v{{ stats.version }}</div>
        <div class="text-sc-muted text-sm">Version du jeu</div>
      </div>
    </div>
    <div v-else-if="loading" class="flex justify-center py-8">
      <div class="w-8 h-8 border-2 border-sc-accent/30 border-t-sc-accent rounded-full animate-spin" />
    </div>

    <!-- Feature cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <router-link
        v-for="f in features"
        :key="f.title"
        :to="f.to"
        class="card p-5 hover:border-sc-accent/50 transition-colors group"
      >
        <div class="text-2xl mb-2">{{ f.icon }}</div>
        <h3 class="text-sc-text-bright font-semibold group-hover:text-sc-accent transition-colors">
          {{ f.title }}
        </h3>
        <p class="text-sc-muted text-sm mt-1">{{ f.desc }}</p>
      </router-link>
    </div>
  </div>
</template>
