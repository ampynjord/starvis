<script setup lang="ts">
import AppNav from '@/components/AppNav.vue';
import { ref } from 'vue';

const sidebarOpen = ref(false);
</script>

<template>
  <div class="min-h-screen flex">
    <!-- Sidebar -->
    <AppNav :open="sidebarOpen" @close="sidebarOpen = false" />

    <!-- Main content -->
    <div class="flex-1 flex flex-col min-h-screen lg:ml-56">
      <!-- Mobile header -->
      <header class="lg:hidden sticky top-0 z-40 glass border-b border-sv-border/40 px-4 h-12 flex items-center gap-3">
        <button @click="sidebarOpen = true" class="text-sv-muted hover:text-sv-text p-1">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
        <router-link to="/" class="flex items-center gap-2 text-sv-text-bright font-semibold text-sm">
          <img src="/starvis-icon.svg" alt="" class="w-5 h-5" />
          Starvis
        </router-link>
      </header>

      <main class="flex-1 px-4 lg:px-6 py-5 max-w-[1400px] w-full mx-auto">
        <router-view v-slot="{ Component, route }">
          <component :is="Component" :key="route.path" />
        </router-view>
      </main>

      <footer class="border-t border-sv-border/30 py-3 text-center text-sv-muted text-xs">
        Starvis v1.0 — Star Citizen Game Database
      </footer>
    </div>
  </div>
</template>
