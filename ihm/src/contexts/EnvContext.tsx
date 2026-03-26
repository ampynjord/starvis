import { createContext, useContext, useState, type ReactNode } from 'react';

export type GameEnv = 'live' | 'ptu';

interface EnvContextType {
  env: GameEnv;
  setEnv: (env: GameEnv) => void;
}

const EnvContext = createContext<EnvContextType>({ env: 'live', setEnv: () => {} });

export function EnvProvider({ children }: { children: ReactNode }) {
  const [env, setEnvState] = useState<GameEnv>(() => {
    if (typeof window === 'undefined') return 'live';
    const stored = localStorage.getItem('starvis-env');
    return stored === 'ptu' ? 'ptu' : 'live';
  });

  const setEnv = (e: GameEnv) => {
    setEnvState(e);
    localStorage.setItem('starvis-env', e);
  };

  return <EnvContext.Provider value={{ env, setEnv }}>{children}</EnvContext.Provider>;
}

export const useEnv = () => useContext(EnvContext);
