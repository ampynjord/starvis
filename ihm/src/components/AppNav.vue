<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const mobileOpen = ref(false)

const navLinks = [
  { to: '/', label: 'Accueil', icon: '🏠' },
  { to: '/ships', label: 'Vaisseaux', icon: '🚀' },
  { to: '/components', label: 'Composants', icon: '🔧' },
  { to: '/compare', label: 'Comparer', icon: '⚖️' },
  { to: '/shops', label: 'Shops', icon: '🛒' },
  { to: '/loadout', label: 'Loadout', icon: '🎯' },
]
</script>

<template>
  <nav class="sticky top-0 z-50 bg-sc-darker/95 backdrop-blur border-b border-sc-border">
    <div class="container mx-auto max-w-7xl px-4">
      <div class="flex items-center justify-between h-14">
        <!-- Logo -->
        <router-link to="/" class="flex items-center gap-2 text-sc-text-bright font-semibold text-lg">
          <img src="/starapi-icon.svg" alt="" class="w-7 h-7" />
          Starapi
        </router-link>

        <!-- Desktop nav -->
        <div class="hidden md:flex items-center gap-1">
          <router-link
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="px-3 py-1.5 rounded-lg text-sm transition-colors"
            :class="route.path === link.to || (link.to !== '/' && route.path.startsWith(link.to))
              ? 'bg-sc-accent/20 text-sc-accent font-medium'
              : 'text-sc-muted hover:text-sc-text hover:bg-sc-border/50'"
          >
            {{ link.label }}
          </router-link>
        </div>

        <!-- Mobile toggle -->
        <button @click="mobileOpen = !mobileOpen" class="md:hidden btn-ghost p-2">
          <span class="text-xl">{{ mobileOpen ? '✕' : '☰' }}</span>
        </button>
      </div>

      <!-- Mobile nav -->
      <div v-if="mobileOpen" class="md:hidden pb-4 space-y-1">
        <router-link
          v-for="link in navLinks"
          :key="link.to"
          :to="link.to"
          class="block px-3 py-2 rounded-lg text-sm"
          :class="route.path === link.to ? 'bg-sc-accent/20 text-sc-accent' : 'text-sc-muted hover:text-sc-text'"
          @click="mobileOpen = false"
        >
          {{ link.icon }} {{ link.label }}
        </router-link>
      </div>
    </div>
  </nav>
</template>
