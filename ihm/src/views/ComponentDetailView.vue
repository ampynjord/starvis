<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getComponent, getComponentBuyLocations, type Component } from '@/services/api'
import LoadingState from '@/components/LoadingState.vue'
import StatBlock from '@/components/StatBlock.vue'

const route = useRoute()
const router = useRouter()
const comp = ref<Component | null>(null)
const buyLocations = ref<any[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const uuid = route.params.uuid as string
    const [compRes, locRes] = await Promise.all([
      getComponent(uuid),
      getComponentBuyLocations(uuid).catch(() => ({ data: [] })),
    ])
    comp.value = compRes.data
    buyLocations.value = locRes.data || []
  } finally {
    loading.value = false
  }
})

function fmt(v: any, unit = '') {
  if (v == null || v === 0) return '—'
  const n = typeof v === 'number' ? v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : v
  return unit ? `${n} ${unit}` : n
}
</script>

<template>
  <LoadingState :loading="loading">
    <div v-if="comp" class="space-y-6">
      <!-- Header -->
      <div>
        <button @click="router.back()" class="btn-ghost text-sm mb-2">← Retour</button>
        <div class="flex items-center gap-3">
          <h1 class="text-3xl font-bold text-sc-text-bright">{{ comp.name }}</h1>
          <span class="badge-blue">{{ comp.type }}</span>
          <span v-if="comp.sub_type" class="badge-amber">{{ comp.sub_type }}</span>
        </div>
        <p class="text-sc-muted mt-1">
          {{ comp.manufacturer_code }} · S{{ comp.size }} · Grade {{ comp.grade || '?' }}
        </p>
      </div>

      <!-- Stats de base -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBlock label="HP" :value="fmt(comp.hp)" color="green" />
        <StatBlock label="Masse" :value="fmt(Math.round(comp.mass))" unit="kg" />
        <StatBlock label="Taille" :value="'S' + comp.size" />
        <StatBlock label="Grade" :value="comp.grade || '—'" />
      </div>

      <!-- Armes -->
      <div v-if="comp.type === 'WeaponGun' || comp.type === 'WeaponMissile'" class="card p-4">
        <h2 class="text-lg font-semibold text-sc-text-bright mb-3">🎯 Statistiques d'arme</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatBlock label="Dégâts" :value="fmt(comp.weapon_damage)" color="red" />
          <StatBlock label="DPS" :value="fmt(comp.weapon_dps)" color="red" />
          <StatBlock label="Burst DPS" :value="fmt(comp.weapon_burst_dps)" color="amber" />
          <StatBlock label="Sustained DPS" :value="fmt(comp.weapon_sustained_dps)" color="amber" />
          <StatBlock label="Fire Rate" :value="fmt(comp.weapon_fire_rate)" unit="/min" />
          <StatBlock label="Portée" :value="fmt(comp.weapon_range)" unit="m" />
        </div>
        <div class="mt-3">
          <h3 class="text-sm font-semibold text-sc-muted mb-2">Répartition des dégâts</h3>
          <div class="grid grid-cols-3 gap-3">
            <StatBlock label="Physique" :value="fmt(comp.weapon_damage_physical)" />
            <StatBlock label="Énergie" :value="fmt(comp.weapon_damage_energy)" />
            <StatBlock label="Distorsion" :value="fmt(comp.weapon_damage_distortion)" />
          </div>
        </div>
      </div>

      <!-- Bouclier -->
      <div v-if="comp.type === 'Shield'" class="card p-4">
        <h2 class="text-lg font-semibold text-sc-text-bright mb-3">🛡️ Bouclier</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatBlock label="Shield HP" :value="fmt(comp.shield_hp)" color="blue" />
          <StatBlock label="Regen" :value="fmt(comp.shield_regen)" unit="/s" color="blue" />
        </div>
      </div>

      <!-- Quantum Drive -->
      <div v-if="comp.type === 'QuantumDrive'" class="card p-4">
        <h2 class="text-lg font-semibold text-sc-text-bright mb-3">⚡ Quantum Drive</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatBlock label="Vitesse QD" :value="fmt(comp.qd_speed)" unit="m/s" color="amber" />
          <StatBlock label="Spool Time" :value="fmt(comp.qd_spool_time)" unit="s" />
        </div>
      </div>

      <!-- PowerPlant -->
      <div v-if="comp.type === 'PowerPlant'" class="card p-4">
        <h2 class="text-lg font-semibold text-sc-text-bright mb-3">⚡ Générateur</h2>
        <div class="grid grid-cols-2 gap-3">
          <StatBlock label="Output" :value="fmt(comp.power_output)" unit="W" color="green" />
        </div>
      </div>

      <!-- Cooler -->
      <div v-if="comp.type === 'Cooler'" class="card p-4">
        <h2 class="text-lg font-semibold text-sc-text-bright mb-3">❄️ Refroidissement</h2>
        <div class="grid grid-cols-2 gap-3">
          <StatBlock label="Cooling Rate" :value="fmt(comp.cooling_rate)" unit="/s" color="blue" />
        </div>
      </div>

      <!-- Buy locations -->
      <div class="card p-4">
        <h2 class="text-lg font-semibold text-sc-text-bright mb-3">🏪 Points d'achat</h2>
        <div v-if="buyLocations.length === 0" class="text-sc-muted text-center py-4">Aucun point d'achat connu</div>
        <div v-else class="space-y-2">
          <div
            v-for="loc in buyLocations"
            :key="loc.shop_id"
            class="flex items-center justify-between border border-sc-border rounded px-3 py-2"
          >
            <div>
              <div class="text-sm font-medium text-sc-text-bright">{{ loc.shop_name }}</div>
              <div class="text-xs text-sc-muted">{{ [loc.parent_location, loc.location].filter(Boolean).join(' · ') }}</div>
            </div>
            <div class="text-right">
              <div v-if="loc.base_price" class="text-sm font-semibold text-sc-gold">{{ loc.base_price.toLocaleString('fr-FR') }} aUEC</div>
              <div class="text-xs text-sc-muted">{{ loc.shop_type || 'Shop' }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="text-center py-12 text-sc-muted">Composant introuvable</div>
  </LoadingState>
</template>
