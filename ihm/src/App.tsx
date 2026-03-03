import { AnimatePresence } from 'framer-motion';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';

export default function App() {
  return (
    <AnimatePresence mode="wait">
      <RouterProvider router={router} />
    </AnimatePresence>
  );
}
