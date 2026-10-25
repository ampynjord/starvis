'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

import type { UniverseCategory } from '@/types/universe';

type EntityCategory = UniverseCategory | string;

interface NexusContextValue {
  openNexus: (category: EntityCategory, id: string) => void;
  closeNexus: () => void;
  isOpen: boolean;
  activeCategory: EntityCategory | null;
  activeId: string | null;
}

const NexusContext = createContext<NexusContextValue | undefined>(undefined);

export function NexusProvider({ children }: { children: React.ReactNode }) {
  const [activeCategory, setActiveCategory] = useState<EntityCategory | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const openNexus = useCallback((category: EntityCategory, id: string) => {
    setActiveCategory(category);
    setActiveId(id);
  }, []);

  const closeNexus = useCallback(() => {
    setActiveCategory(null);
    setActiveId(null);
  }, []);

  return (
    <NexusContext.Provider
      value={{
        openNexus,
        closeNexus,
        isOpen: activeCategory !== null && activeId !== null,
        activeCategory,
        activeId,
      }}
    >
      {children}
    </NexusContext.Provider>
  );
}

export function useEntityNexus() {
  const context = useContext(NexusContext);
  if (!context) {
    throw new Error('useEntityNexus must be used within a NexusProvider');
  }
  return context;
}
