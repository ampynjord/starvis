'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface AdvancedModeContextType {
  isAdvancedMode: boolean;
  setAdvancedMode: (value: boolean) => void;
  toggleAdvancedMode: () => void;
}

const AdvancedModeContext = createContext<AdvancedModeContextType | undefined>(undefined);

export function AdvancedModeProvider({ children }: { children: React.ReactNode }) {
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('starvis_advanced_mode');
      if (stored) {
        setIsAdvancedMode(stored === 'true');
      }
    } catch (e) {
      // Ignore localStorage errors
    }
  }, []);

  const setAdvancedMode = (value: boolean) => {
    setIsAdvancedMode(value);
    try {
      localStorage.setItem('starvis_advanced_mode', String(value));
    } catch (e) {
      // Ignore
    }
  };

  const toggleAdvancedMode = () => setAdvancedMode(!isAdvancedMode);

  return (
    <AdvancedModeContext.Provider value={{ isAdvancedMode, setAdvancedMode, toggleAdvancedMode }}>
      {children}
    </AdvancedModeContext.Provider>
  );
}

export function useAdvancedMode() {
  const context = useContext(AdvancedModeContext);
  if (context === undefined) {
    throw new Error('useAdvancedMode must be used within an AdvancedModeProvider');
  }
  return context;
}
