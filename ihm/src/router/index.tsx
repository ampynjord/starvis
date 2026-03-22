import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { lazy, Suspense, type ReactElement } from 'react';
import { LoadingGrid } from '@/components/ui/LoadingGrid';

const wrap = (Component: React.LazyExoticComponent<() => ReactElement | null>) => (
  <Suspense fallback={<LoadingGrid />}>
    <Component />
  </Suspense>
);

const HomePage            = lazy(() => import('@/pages/HomePage'));
const ShipsPage           = lazy(() => import('@/pages/ShipsPage'));
const ShipDetailPage      = lazy(() => import('@/pages/ShipDetailPage'));
const ComparePage         = lazy(() => import('@/pages/ComparePage'));
const ComponentsPage      = lazy(() => import('@/pages/ComponentsPage'));
const ComponentDetailPage = lazy(() => import('@/pages/ComponentDetailPage'));
const ItemsPage           = lazy(() => import('@/pages/ItemsPage'));
const ItemDetailPage      = lazy(() => import('@/pages/ItemDetailPage'));
const CommoditiesPage     = lazy(() => import('@/pages/CommoditiesPage'));
const CommodityDetailPage = lazy(() => import('@/pages/CommodityDetailPage'));
const ManufacturersPage   = lazy(() => import('@/pages/ManufacturersPage'));
const ShopsPage           = lazy(() => import('@/pages/ShopsPage'));
const ChangelogPage       = lazy(() => import('@/pages/ChangelogPage'));
const RankingPage         = lazy(() => import('@/pages/RankingPage'));
const OutfitterPage       = lazy(() => import('@/pages/OutfitterPage'));
const MiningPage          = lazy(() => import('@/pages/MiningPage'));
const MissionsPage        = lazy(() => import('@/pages/MissionsPage'));
const NotFoundPage        = lazy(() => import('@/pages/NotFoundPage'));

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true,              element: wrap(HomePage) },
      { path: 'ships',            element: wrap(ShipsPage) },
      { path: 'ships/:uuid',      element: wrap(ShipDetailPage) },
      { path: 'compare',          element: wrap(ComparePage) },
      { path: 'ranking',          element: wrap(RankingPage) },
      { path: 'outfitter',        element: wrap(OutfitterPage) },
      { path: 'mining',           element: wrap(MiningPage) },
      { path: 'fps-gear',         element: wrap(ItemsPage) },
      { path: 'other-items',      element: wrap(ItemsPage) },
      { path: 'industrial',       element: wrap(CommoditiesPage) },
      { path: 'minerals',         element: <Navigate to="/mining" replace /> },
      { path: 'equipment',        element: <Navigate to="/components" replace /> },
      { path: 'missions',         element: wrap(MissionsPage) },
      { path: 'components',        element: wrap(ComponentsPage) },
      { path: 'components/:uuid',  element: wrap(ComponentDetailPage) },
      { path: 'items',             element: <Navigate to="/fps-gear" replace /> },
      { path: 'items/:uuid',       element: wrap(ItemDetailPage) },
      { path: 'commodities',       element: <Navigate to="/industrial" replace /> },
      { path: 'commodities/:uuid', element: wrap(CommodityDetailPage) },
      { path: 'manufacturers',     element: wrap(ManufacturersPage) },
      { path: 'shops',            element: wrap(ShopsPage) },
      { path: 'changelog',        element: wrap(ChangelogPage) },
      { path: 'paints',            element: <Navigate to="/ships" replace /> },
      { path: '*',                element: wrap(NotFoundPage) },
    ],
  },
]);
