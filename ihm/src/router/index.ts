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
      meta: { title: 'Starvis — Star Citizen Database' },
    },
    {
      path: '/ships',
      name: 'ships',
      component: () => import('@/views/ShipsView.vue'),
      meta: { title: 'Ships — Starvis' },
    },
    {
      path: '/ships/:uuid',
      name: 'ship-detail',
      component: () => import('@/views/ShipDetailView.vue'),
      meta: { title: 'Ship Details — Starvis' },
    },
    {
      path: '/components',
      name: 'components',
      component: () => import('@/views/ComponentsView.vue'),
      meta: { title: 'Components — Starvis' },
    },
    {
      path: '/components/:uuid',
      name: 'component-detail',
      component: () => import('@/views/ComponentDetailView.vue'),
      meta: { title: 'Component Details — Starvis' },
    },
    {
      path: '/compare',
      name: 'compare',
      component: () => import('@/views/CompareView.vue'),
      meta: { title: 'Compare — Starvis' },
    },
    {
      path: '/shops',
      name: 'shops',
      component: () => import('@/views/ShopsView.vue'),
      meta: { title: 'Shops — Starvis' },
    },
    {
      path: '/paints',
      name: 'paints',
      component: () => import('@/views/PaintsView.vue'),
      meta: { title: 'Paints — Starvis' },
    },
    {
      path: '/manufacturers',
      name: 'manufacturers',
      component: () => import('@/views/ManufacturersView.vue'),
      meta: { title: 'Manufacturers — Starvis' },
    },
    {
      path: '/loadout/:uuid?',
      name: 'loadout',
      component: () => import('@/views/LoadoutView.vue'),
      meta: { title: 'Loadout Manager — Starvis' },
    },
    {
      path: '/hangar',
      name: 'hangar',
      component: () => import('@/views/HangarView.vue'),
      meta: { title: 'Hangar — Starvis' },
    },
    {
      path: '/changelog',
      name: 'changelog',
      component: () => import('@/views/ChangelogView.vue'),
      meta: { title: 'Changelog — Starvis' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { title: 'Not Found — Starvis' },
    },
  ],
})

// Dynamic page title based on route meta
router.afterEach((to) => {
  document.title = (to.meta?.title as string) || 'Starvis'
})

export default router
