import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/ships',
      name: 'ships',
      component: () => import('@/views/ShipsView.vue'),
    },
    {
      path: '/ships/:uuid',
      name: 'ship-detail',
      component: () => import('@/views/ShipDetailView.vue'),
    },
    {
      path: '/components',
      name: 'components',
      component: () => import('@/views/ComponentsView.vue'),
    },
    {
      path: '/components/:uuid',
      name: 'component-detail',
      component: () => import('@/views/ComponentDetailView.vue'),
    },
    {
      path: '/compare',
      name: 'compare',
      component: () => import('@/views/CompareView.vue'),
    },
    {
      path: '/shops',
      name: 'shops',
      component: () => import('@/views/ShopsView.vue'),
    },
    {
      path: '/loadout/:uuid?',
      name: 'loadout',
      component: () => import('@/views/LoadoutView.vue'),
    },
  ],
})

export default router
