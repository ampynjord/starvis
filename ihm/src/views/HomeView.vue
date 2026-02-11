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

const tools = [
  { icon: '🚀', title: 'Vaisseaux', desc: '300+ vaisseaux avec stats directes des fichiers du jeu', to: '/ships', color: 'from-blue-500/10 to-transparent' },
  { icon: '⚙️', title: 'Composants', desc: 'Armes, boucliers, power plants, coolers, QD et plus', to: '/components', color: 'from-emerald-500/10 to-transparent' },
  { icon: '⚖️', title: 'Comparer', desc: 'Comparaison côte à côte avec deltas visuels', to: '/compare', color: 'from-purple-500/10 to-transparent' },
  { icon: '🏪', title: 'Boutiques', desc: 'Boutiques in-game et inventaires', to: '/shops', color: 'from-amber-500/10 to-transparent' },
  { icon: '🎯', title: 'Loadout', desc: 'Simulateur de loadout avec stats en temps réel', to: '/loadout', color: 'from-red-500/10 to-transparent' },
  { icon: '🏛️', title: 'Exec Hangar', desc: 'Timer d\'ouverture du Hangar Exécutif', to: '/hangar', color: 'from-cyan-500/10 to-transparent' },
]
</script>

<template>
  <div class="space-y-8">
    <!-- Hero -->
    <div class="text-center py-8">
      <h1 class="text-3xl font-bold text-sv-text-bright mb-2 tracking-tight">
        Starvis
      </h1>
      <p class="text-sv-muted max-w-xl mx-auto text-sm leading-relaxed">
        Base de données complète Star Citizen — Vaisseaux, composants, shops et outils<br />
        <span class="text-sv-muted/60">Données extraites directement des fichiers de jeu (P4K/DataForge)</span>
      </p>
    </div>

    <!-- Stats -->
    <div v-if="stats" class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div class="card p-4 text-center">
        <div class="text-2xl font-bold text-sv-accent">{{ stats.ships.toLocaleString('fr-FR') }}</div>
        <div class="text-sv-muted text-xs mt-0.5">Vaisseaux</div>
      </div>
      <div class="card p-4 text-center">
        <div class="text-2xl font-bold text-emerald-400">{{ stats.components.toLocaleString('fr-FR') }}</div>
        <div class="text-sv-muted text-xs mt-0.5">Composants</div>
      </div>
      <div class="card p-4 text-center">
        <div class="text-2xl font-bold text-amber-400">{{ stats.manufacturers }}</div>
        <div class="text-sv-muted text-xs mt-0.5">Fabricants</div>
      </div>
      <div class="card p-4 text-center">
        <div class="text-2xl font-bold text-purple-400">v{{ stats.version }}</div>
        <div class="text-sv-muted text-xs mt-0.5">Version du jeu</div>
      </div>
    </div>
    <div v-else-if="loading" class="flex justify-center py-8">
      <div class="w-7 h-7 border-2 border-sv-accent/20 border-t-sv-accent rounded-full animate-spin" />
    </div>

    <!-- Tools grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <router-link
        v-for="t in tools"
        :key="t.title"
        :to="t.to"
        class="card-hover p-5 group relative overflow-hidden"
      >
        <div class="absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity" :class="t.color" />
        <div class="relative">
          <div class="text-xl mb-2">{{ t.icon }}</div>
          <h3 class="text-sv-text-bright font-semibold text-sm group-hover:text-sv-accent transition-colors">
            {{ t.title }}
          </h3>
          <p class="text-sv-muted text-xs mt-1 leading-relaxed">{{ t.desc }}</p>
        </div>
      </router-link>
    </div>

    <!-- API info -->
    <div class="card p-5 text-center">
      <h3 class="text-sm font-semibold text-sv-text-bright mb-1">API REST ouverte</h3>
      <p class="text-xs text-sv-muted">
        Pagination, filtres, tri, CSV export, ETag caching — <code class="text-sv-accent text-[11px]">/api/v1/</code>
      </p>
    </div>
  </div>
</template>
