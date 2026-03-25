import { AnimatePresence } from 'framer-motion';
import { RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { EnvProvider } from './contexts/EnvContext';
import { router } from './router';

export default function App() {
  return (
    <ErrorBoundary>
      <EnvProvider>
        <AnimatePresence mode="wait">
          <RouterProvider router={router} />
        </AnimatePresence>
      </EnvProvider>
    </ErrorBoundary>
  );
}
