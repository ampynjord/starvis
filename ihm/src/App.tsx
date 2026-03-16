import { AnimatePresence } from 'framer-motion';
import { RouterProvider } from 'react-router-dom';
import { EnvProvider } from './contexts/EnvContext';
import { router } from './router';

export default function App() {
  return (
    <EnvProvider>
      <AnimatePresence mode="wait">
        <RouterProvider router={router} />
      </AnimatePresence>
    </EnvProvider>
  );
}
