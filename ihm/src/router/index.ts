import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition || { top: 0 }
  },
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
      path: '/manufacturers',
      name: 'manufacturers',
      component: () => import('@/views/ManufacturersView.vue'),
    },
    {
      path: '/loadout/:uuid?',
      name: 'loadout',
      component: () => import('@/views/LoadoutView.vue'),
    },
    {
      path: '/hangar',
      name: 'hangar',
      component: () => import('@/views/HangarView.vue'),
    },
    {
      path: '/changelog',
      name: 'changelog',
      component: () => import('@/views/ChangelogView.vue'),
    },
  ],
})

export default router
