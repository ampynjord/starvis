<script setup lang="ts">
import LoadingState from '@/components/LoadingState.vue'
import StatBlock from '@/components/StatBlock.vue'
import { getComponent, getComponentBuyLocations, type Component } from '@/services/api'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

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
        <button @click="router.back()" class="btn-ghost text-xs mb-2">← Retour</button>
        <div class="flex items-center gap-2 flex-wrap">
          <h1 class="text-2xl font-bold text-sv-text-bright">{{ comp.name }}</h1>
          <span class="badge-blue text-[10px]">{{ comp.type }}</span>
          <span v-if="comp.sub_type" class="badge-amber text-[10px]">{{ comp.sub_type }}</span>
        </div>
        <p class="text-sv-muted text-sm mt-1">
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
        <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-3">Statistiques d'arme</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatBlock label="Dégâts" :value="fmt(comp.weapon_damage)" color="red" />
          <StatBlock label="DPS" :value="fmt(comp.weapon_dps)" color="red" />
          <StatBlock label="Burst DPS" :value="fmt(comp.weapon_burst_dps)" color="amber" />
          <StatBlock label="Sustained DPS" :value="fmt(comp.weapon_sustained_dps)" color="amber" />
          <StatBlock label="Fire Rate" :value="fmt(comp.weapon_fire_rate)" unit="/min" />
          <StatBlock label="Portée" :value="fmt(comp.weapon_range)" unit="m" />
        </div>
        <div class="mt-3">
          <h3 class="text-[11px] font-semibold text-sv-muted uppercase tracking-wider mb-2">Répartition des dégâts</h3>
          <div class="grid grid-cols-3 gap-3">
            <StatBlock label="Physique" :value="fmt(comp.weapon_damage_physical)" />
            <StatBlock label="Énergie" :value="fmt(comp.weapon_damage_energy)" />
            <StatBlock label="Distorsion" :value="fmt(comp.weapon_damage_distortion)" />
          </div>
        </div>
      </div>

      <!-- Bouclier -->
      <div v-if="comp.type === 'Shield'" class="card p-4">
        <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-3">Bouclier</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatBlock label="Shield HP" :value="fmt(comp.shield_hp)" color="blue" />
          <StatBlock label="Regen" :value="fmt(comp.shield_regen)" unit="/s" color="blue" />
        </div>
      </div>

      <!-- Quantum Drive -->
      <div v-if="comp.type === 'QuantumDrive'" class="card p-4">
        <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-3">Quantum Drive</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatBlock label="Vitesse QD" :value="fmt(comp.qd_speed)" unit="m/s" color="amber" />
          <StatBlock label="Spool Time" :value="fmt(comp.qd_spool_time)" unit="s" />
        </div>
      </div>

      <!-- PowerPlant -->
      <div v-if="comp.type === 'PowerPlant'" class="card p-4">
        <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-3">Générateur</h2>
        <div class="grid grid-cols-2 gap-3">
          <StatBlock label="Output" :value="fmt(comp.power_output)" unit="W" color="green" />
        </div>
      </div>

      <!-- Cooler -->
      <div v-if="comp.type === 'Cooler'" class="card p-4">
        <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-3">Refroidissement</h2>
        <div class="grid grid-cols-2 gap-3">
          <StatBlock label="Cooling Rate" :value="fmt(comp.cooling_rate)" unit="/s" color="blue" />
        </div>
      </div>

      <!-- Buy locations -->
      <div class="card p-4">
        <h2 class="text-xs font-semibold text-sv-accent uppercase tracking-wider mb-3">Points d'achat</h2>
        <div v-if="buyLocations.length === 0" class="text-sv-muted text-center py-4 text-sm">Aucun point d'achat connu</div>
        <div v-else class="space-y-1.5">
          <div
            v-for="loc in buyLocations"
            :key="loc.shop_id"
            class="flex items-center justify-between border border-sv-border/40 rounded px-2.5 py-1.5 hover:bg-sv-panel-light/30 transition-colors"
          >
            <div>
              <div class="text-xs font-medium text-sv-text-bright">{{ loc.shop_name }}</div>
              <div class="text-[10px] text-sv-muted">{{ [loc.parent_location, loc.location].filter(Boolean).join(' · ') }}</div>
            </div>
            <div class="text-right">
              <div v-if="loc.base_price" class="text-xs font-semibold text-sv-gold">{{ loc.base_price.toLocaleString('fr-FR') }} aUEC</div>
              <div class="text-[10px] text-sv-muted">{{ loc.shop_type || 'Shop' }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="text-center py-12 text-sv-muted text-sm">Composant introuvable</div>
  </LoadingState>
</template>
