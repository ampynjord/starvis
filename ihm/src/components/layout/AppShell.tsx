'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { OmniSearchModal } from '../search/OmniSearchModal';
import { EntityNexusSheet } from '../universe/EntityNexusSheet';
import { NexusProvider, useEntityNexus } from '@/contexts/NexusContext';

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [omnibarOpen, setOmnibarOpen] = useState(false);

  const { isOpen, activeCategory, activeId, closeNexus, openNexus } = useEntityNexus();

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
      {/* Drawer Overlay (Both Mobile & Desktop) */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            onClick={closeSidebar}
          />
        )}
      </AnimatePresence>

      {/* Slide-out Sidebar Drawer */}
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />

      {/* Cockpit Main Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar onMenuToggle={toggleSidebar} onSearchClick={() => setOmnibarOpen(true)} />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-void bg-grid">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="min-h-full min-w-0 p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full"
          >
            {children}
          </motion.div>
        </main>
      </div>

      {/* Global OmniSearch Palette (Ctrl+K) */}
      <OmniSearchModal
        open={omnibarOpen}
        onClose={() => setOmnibarOpen(false)}
        onSelectEntity={(category, id) => {
          openNexus(category as any, id);
        }}
      />

      {/* Global 360° Pivot Entity Nexus Sheet */}
      <EntityNexusSheet
        open={isOpen}
        category={activeCategory}
        id={activeId}
        onClose={closeNexus}
      />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <NexusProvider>
      <AppShellInner>{children}</AppShellInner>
    </NexusProvider>
  );
}
