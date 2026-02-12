
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// Executive Hangar cycle constants (from xyxyll.com, patch 4.6.0)
const OPEN_DURATION = 3_900_415   // ~65 min online
const CLOSE_DURATION = 7_200_767  // ~120 min offline
const CYCLE_DURATION = OPEN_DURATION + CLOSE_DURATION // ~185 min
const INITIAL_OPEN_TIME = new Date('2026-02-01T17:09:54.775-05:00').getTime()

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval>

onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => clearInterval(timer))

const elapsed = computed(() => now.value - INITIAL_OPEN_TIME)
const timeInCycle = computed(() => ((elapsed.value % CYCLE_DURATION) + CYCLE_DURATION) % CYCLE_DURATION)
const isOnline = computed(() => timeInCycle.value < OPEN_DURATION)
const cycleNumber = computed(() => Math.floor(elapsed.value / CYCLE_DURATION) + 32)

const timeUntilChange = computed(() => {
  if (isOnline.value) return OPEN_DURATION - timeInCycle.value
  return CLOSE_DURATION - (timeInCycle.value - OPEN_DURATION)
})

const progressPct = computed(() => {
  if (isOnline.value) return (timeInCycle.value / OPEN_DURATION) * 100
  return ((timeInCycle.value - OPEN_DURATION) / CLOSE_DURATION) * 100
})

function fmtDuration(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

// Upcoming cycles (next 6)
const upcomingCycles = computed(() => {
  const cycles: { start: number; end: number; type: 'online' | 'offline'; cycleNum: number }[] = []
  let currentCycleStart = INITIAL_OPEN_TIME + Math.floor(elapsed.value / CYCLE_DURATION) * CYCLE_DURATION
  for (let i = 0; i < 8; i++) {
    const openStart = currentCycleStart + i * CYCLE_DURATION
    const openEnd = openStart + OPEN_DURATION
    const closeEnd = openEnd + CLOSE_DURATION
    const cNum = Math.floor((openStart - INITIAL_OPEN_TIME) / CYCLE_DURATION) + 32
    if (openEnd > now.value) cycles.push({ start: openStart, end: openEnd, type: 'online', cycleNum: cNum })
    if (closeEnd > now.value) cycles.push({ start: openEnd, end: closeEnd, type: 'offline', cycleNum: cNum })
    if (cycles.length >= 8) break
  }
  return cycles.filter(c => c.end > now.value).slice(0, 8)
})

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ── Executive Hangar ships (available with Military or Stealth loadout) ──
interface ExecShip {
  name: string
  className: string
  manufacturer: string
  loadout: 'Military' | 'Stealth' | 'Both'
  size: string
}

const EXEC_SHIPS: ExecShip[] = [
  { name: 'Corsair', className: 'DRAK_Corsair_Exec_Military', manufacturer: 'Drake', loadout: 'Military', size: 'Medium' },
  { name: 'Corsair', className: 'DRAK_Corsair_Exec_StealthIndustrial', manufacturer: 'Drake', loadout: 'Stealth', size: 'Medium' },
  { name: 'Cutlass Black', className: 'DRAK_Cutlass_Black_Exec_Military', manufacturer: 'Drake', loadout: 'Military', size: 'Medium' },
  { name: 'Cutlass Black', className: 'DRAK_Cutlass_Black_Exec_Stealth', manufacturer: 'Drake', loadout: 'Stealth', size: 'Medium' },
  { name: 'Guardian MX', className: 'MRAI_Guardian_MX', manufacturer: 'Mirai', loadout: 'Military', size: 'Small' },
  { name: 'Hornet F7A Mk2', className: 'ANVL_Hornet_F7A_Mk2_Exec_Military', manufacturer: 'Anvil', loadout: 'Military', size: 'Small' },
  { name: 'Hornet F7A Mk2', className: 'ANVL_Hornet_F7A_Mk2_Exec_Stealth', manufacturer: 'Anvil', loadout: 'Stealth', size: 'Small' },
  { name: 'Lightning F8C', className: 'ANVL_Lightning_F8C_Exec_Military', manufacturer: 'Anvil', loadout: 'Military', size: 'Small' },
  { name: 'Lightning F8C', className: 'ANVL_Lightning_F8C_Exec_Stealth', manufacturer: 'Anvil', loadout: 'Stealth', size: 'Small' },
  { name: 'Syulen', className: 'GAMA_Syulen_Exec_Military', manufacturer: 'Gatac', loadout: 'Military', size: 'Small' },
  { name: 'Syulen', className: 'GAMA_Syulen_Exec_Stealth', manufacturer: 'Gatac', loadout: 'Stealth', size: 'Small' },
]

const loadoutFilter = ref<'all' | 'Military' | 'Stealth'>('all')

const filteredExecShips = computed(() => {
  if (loadoutFilter.value === 'all') return EXEC_SHIPS
  return EXEC_SHIPS.filter(s => s.loadout === loadoutFilter.value)
})
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <div class="text-center space-y-2">
      <h1 class="text-2xl font-bold text-sv-text-bright">Executive Hangar</h1>
      <p class="text-sm text-sv-muted">Executive Hangar opening schedule (Patch 4.0+)</p>
    </div>

    <!-- Status card -->
    <div class="card p-8 text-center space-y-4">
      <div
        class="inline-flex items-center gap-3 px-6 py-3 rounded-full text-xl font-bold"
        :class="isOnline
          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
          : 'bg-red-500/15 text-red-400 border border-red-500/30'"
      >
        <span
          class="w-3 h-3 rounded-full"
          :class="isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'"
        />
        {{ isOnline ? 'ONLINE' : 'OFFLINE' }}
      </div>

      <!-- Countdown -->
      <div class="space-y-1">
        <div class="text-sv-muted text-sm">
          {{ isOnline ? 'Closing in' : 'Opening in' }}
        </div>
        <div class="text-3xl font-mono font-bold text-sv-text-bright">
          {{ fmtDuration(timeUntilChange) }}
        </div>
      </div>

      <!-- Progress bar -->
      <div class="w-full bg-sv-border/40 rounded-full h-2 overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-1000"
          :class="isOnline ? 'bg-emerald-500' : 'bg-red-500/60'"
          :style="{ width: progressPct + '%' }"
        />
      </div>

      <div class="flex justify-between text-xs text-sv-muted">
        <span>Cycle #{{ cycleNumber }}</span>
        <span>{{ isOnline ? '~65 min online' : '~120 min offline' }}</span>
      </div>
    </div>

    <!-- Upcoming cycles -->
    <div class="card p-5 space-y-3">
      <h2 class="section-title text-base">Upcoming cycles</h2>
      <div class="space-y-1">
        <div
          v-for="(cycle, i) in upcomingCycles"
          :key="i"
          class="flex items-center justify-between px-3 py-2 rounded-lg text-sm"
          :class="cycle.type === 'online'
            ? 'bg-emerald-500/8 border border-emerald-500/15'
            : 'bg-sv-darker/50 border border-sv-border/30'"
        >
          <div class="flex items-center gap-2">
            <span
              class="w-2 h-2 rounded-full"
              :class="cycle.type === 'online' ? 'bg-emerald-400' : 'bg-sv-muted/40'"
            />
            <span :class="cycle.type === 'online' ? 'text-emerald-400 font-medium' : 'text-sv-muted'">
              {{ cycle.type === 'online' ? 'OPEN' : 'CLOSED' }}
            </span>
          </div>
          <div class="text-sv-text text-xs font-mono">
            {{ fmtTime(cycle.start) }} — {{ fmtTime(cycle.end) }}
          </div>
          <div class="text-sv-muted text-xs">
            {{ fmtDate(cycle.start) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Exec Hangar Ships -->
    <div class="card p-5 space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="section-title text-base">🚀 Ships available</h2>
        <div class="flex gap-1">
          <button @click="loadoutFilter = 'all'"
            class="px-2.5 py-1 rounded text-[10px] font-medium transition-colors"
            :class="loadoutFilter === 'all' ? 'bg-sv-accent/20 text-sv-accent border border-sv-accent/30' : 'text-sv-muted hover:text-sv-text'">
            All
          </button>
          <button @click="loadoutFilter = 'Military'"
            class="px-2.5 py-1 rounded text-[10px] font-medium transition-colors"
            :class="loadoutFilter === 'Military' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-sv-muted hover:text-sv-text'">
            ⚔️ Military
          </button>
          <button @click="loadoutFilter = 'Stealth'"
            class="px-2.5 py-1 rounded text-[10px] font-medium transition-colors"
            :class="loadoutFilter === 'Stealth' ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'text-sv-muted hover:text-sv-text'">
            🥷 Stealth
          </button>
        </div>
      </div>

      <div class="space-y-1">
        <div
          v-for="ship in filteredExecShips" :key="ship.className"
          class="flex items-center justify-between px-3 py-2.5 rounded-lg bg-sv-darker/50 border border-sv-border/30 hover:border-sv-accent/30 cursor-pointer transition-colors"
          @click="router.push(`/ships/${ship.className}`)"
        >
          <div class="flex items-center gap-3">
            <span class="text-sm font-medium text-sv-text-bright">{{ ship.name }}</span>
            <span class="text-[10px] text-sv-muted">{{ ship.manufacturer }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[10px] text-sv-muted">{{ ship.size }}</span>
            <span
              class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
              :class="ship.loadout === 'Military'
                ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                : 'bg-violet-500/15 text-violet-400 border border-violet-500/20'"
            >
              {{ ship.loadout }}
            </span>
          </div>
        </div>
      </div>

      <p class="text-[10px] text-sv-muted/60 text-center">
        Click a ship to view its full loadout details
      </p>
    </div>

    <!-- Info -->
    <div class="card p-5 space-y-2 text-sm text-sv-muted">
      <h2 class="section-title text-base">How does it work?</h2>
      <p>
        The Star Citizen Executive Hangar operates on a fixed cycle of <span class="text-sv-text">~185 minutes</span>:
      </p>
      <ul class="list-disc list-inside space-y-1 ml-2">
        <li><span class="text-emerald-400">~65 minutes</span> open (ONLINE)</li>
        <li><span class="text-red-400">~120 minutes</span> closed (OFFLINE)</li>
      </ul>
      <p class="text-xs mt-2">
        Based on patch 4.6.0-LIVE data. Timings are deterministic and calculated client-side.
      </p>
    </div>
  </div>
</template>
