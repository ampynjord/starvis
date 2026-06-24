'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { SearchOmnibar } from '../ui/SearchOmnibar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [omnibarOpen, setOmnibarOpen] = useState(false);
  
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOmnibarOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-dvh min-w-0 overflow-hidden bg-void">
      {/* Scan line */}
      <div
        className="animate-scanline pointer-events-none fixed left-0 right-0 h-20 z-50"
        style={{
          background: 'linear-gradient(to bottom, transparent, rgba(0,212,255,0.025), transparent)',
        }}
      />

      {/* Overlay mobile */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-30 bg-black/60 md:hidden"
            onClick={closeSidebar}
          />
        )}
      </AnimatePresence>

      <Sidebar open={sidebarOpen} onClose={closeSidebar} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar onMenuToggle={toggleSidebar} onSearchClick={() => setOmnibarOpen(true)} />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-void bg-grid">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="min-h-full min-w-0 p-3 sm:p-6"
          >
            {children}
          </motion.div>
        </main>
      </div>

      <SearchOmnibar open={omnibarOpen} onClose={() => setOmnibarOpen(false)} />
    </div>
  );
}
