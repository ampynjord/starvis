<script setup lang="ts">
import LoadingState from '@/components/LoadingState.vue'
import PaginationBar from '@/components/PaginationBar.vue'
import { getChangelog, type ChangelogEntry } from '@/services/api'
import { computed, onMounted, ref, watch } from 'vue'

const entries = ref<ChangelogEntry[]>([])
const total = ref(0)
const loading = ref(true)
const page = ref(1)
const perPage = 50
const entityType = ref('')
const changeType = ref('')

async function load() {
  loading.value = true
  try {
    const params: Record<string, string> = {
      limit: String(perPage),
      offset: String((page.value - 1) * perPage),
    }
    if (entityType.value) params.entity_type = entityType.value
    if (changeType.value) params.change_type = changeType.value
    const res = await getChangelog(params)
    entries.value = res.data || []
    total.value = res.total || 0
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([entityType, changeType], () => { page.value = 1; load() })
watch(page, load)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage)))

function badgeClass(type: string) {
  switch (type) {
    case 'added': return 'badge-green'
    case 'removed': return 'badge-red'
    case 'modified': return 'badge-blue'
    default: return 'badge-blue'
  }
}

function entityIcon(type: string) {
  switch (type) {
    case 'ship': return '🚀'
    case 'component': return '⚙️'
    case 'shop': return '🏪'
    case 'module': return '📦'
    default: return '📄'
  }
}

function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-4">
    <h1 class="text-lg font-bold text-sv-text-bright">Changelog</h1>
    <p class="text-xs text-sv-muted">Tracking additions, removals and modifications between P4K/DataForge extractions.</p>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3 items-center">
      <select v-model="entityType" class="input text-xs">
        <option value="">All types</option>
        <option value="ship">Ships</option>
        <option value="component">Components</option>
        <option value="shop">Shops</option>
        <option value="module">Modules</option>
      </select>
      <select v-model="changeType" class="input text-xs">
        <option value="">All changes</option>
        <option value="added">Added</option>
        <option value="removed">Removed</option>
        <option value="modified">Modified</option>
      </select>
      <span class="text-[11px] text-sv-muted ml-auto">{{ total }} entr{{ total > 1 ? 'ies' : 'y' }}</span>
    </div>

    <LoadingState :loading="loading">
      <div v-if="entries.length === 0" class="text-center py-12 text-sv-muted text-sm">
        No changes recorded.
      </div>
      <div v-else class="space-y-1">
        <div
          v-for="e in entries"
          :key="e.id"
          class="card px-3 py-2 flex items-center gap-3 text-xs"
        >
          <span class="text-base shrink-0">{{ entityIcon(e.entity_type) }}</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="font-medium text-sv-text-bright truncate">{{ e.entity_name || e.entity_uuid }}</span>
              <span :class="badgeClass(e.change_type)" class="text-[10px]">{{ e.change_type }}</span>
            </div>
            <div v-if="e.field_name" class="text-[10px] text-sv-muted mt-0.5">
              <span class="font-mono">{{ e.field_name }}</span>:
              <span class="text-red-400 line-through">{{ e.old_value || '∅' }}</span>
              → <span class="text-green-400">{{ e.new_value || '∅' }}</span>
            </div>
          </div>
          <div class="text-right shrink-0 text-[10px] text-sv-muted">
            <div>{{ e.game_version || '—' }}</div>
            <div>{{ fmtDate(e.created_at) }}</div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <PaginationBar v-if="totalPages > 1" :page="page" :pages="totalPages" :total="total" @update:page="page = $event" />
    </LoadingState>
  </div>
</template>
