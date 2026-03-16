import { createBrowserRouter } from 'react-router-dom';
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
const CommoditiesPage     = lazy(() => import('@/pages/CommoditiesPage'));
const ManufacturersPage   = lazy(() => import('@/pages/ManufacturersPage'));
const ShopsPage           = lazy(() => import('@/pages/ShopsPage'));
const ChangelogPage       = lazy(() => import('@/pages/ChangelogPage'));
const PaintsPage          = lazy(() => import('@/pages/PaintsPage'));
const RankingPage         = lazy(() => import('@/pages/RankingPage'));
const OutfitterPage       = lazy(() => import('@/pages/OutfitterPage'));
const TradePage           = lazy(() => import('@/pages/TradePage'));
const MiningPage          = lazy(() => import('@/pages/MiningPage'));
const MissionsPage        = lazy(() => import('@/pages/MissionsPage'));
const ResourcesPage       = lazy(() => import('@/pages/ResourcesPage'));
const ArmorPage           = lazy(() => import('@/pages/ArmorPage'));
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
      { path: 'trade',            element: wrap(TradePage) },
      { path: 'mining',           element: wrap(MiningPage) },
      { path: 'missions',         element: wrap(MissionsPage) },
      { path: 'resources',        element: wrap(ResourcesPage) },
      { path: 'armor',            element: wrap(ArmorPage) },
      { path: 'components',       element: wrap(ComponentsPage) },
      { path: 'components/:uuid', element: wrap(ComponentDetailPage) },
      { path: 'items',            element: wrap(ItemsPage) },
      { path: 'commodities',      element: wrap(CommoditiesPage) },
      { path: 'manufacturers',    element: wrap(ManufacturersPage) },
      { path: 'shops',            element: wrap(ShopsPage) },
      { path: 'changelog',        element: wrap(ChangelogPage) },
      { path: 'paints',            element: wrap(PaintsPage) },
      { path: '*',                element: wrap(NotFoundPage) },
    ],
  },
]);
