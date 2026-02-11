<script setup lang="ts">
import AppNav from '@/components/AppNav.vue'
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <AppNav />
    <main class="flex-1 container mx-auto px-4 py-6 max-w-7xl">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
    <footer class="border-t border-sc-border py-4 text-center text-sc-muted text-sm">
      Starapi v1.0 — Star Citizen Data API
    </footer>
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
