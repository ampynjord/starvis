import { motion } from 'framer-motion';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell() {
  const location = useLocation();
  return (
    <div className="flex h-screen overflow-hidden bg-void">
      {/* Scan line */}
      <div
        className="animate-scanline pointer-events-none fixed left-0 right-0 h-20 z-50"
        style={{
          background: 'linear-gradient(to bottom, transparent, rgba(0,212,255,0.025), transparent)',
        }}
      />

      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto bg-void bg-grid">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="p-6 min-h-full"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
