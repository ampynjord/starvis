'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export interface AuthUser {
  id: number;
  uuid: string;
  email: string;
  username: string;
  role: string;
  avatarUrl: string | null;
  createdAt: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (emailOrUsername: string, password: string) => Promise<{ requires2FA: true; pendingToken: string } | void>;
  register: (email: string, username: string, password: string) => Promise<{ requiresVerification: true } | void>;
  verify2FA: (pendingToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function readJsonSafe(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: 'Service unavailable. Please try again later.' };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await readJsonSafe(res);
        setState({ user: data.user, loading: false });
      } else {
        setState({ user: null, loading: false });
      }
    } catch {
      setState({ user: null, loading: false });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (emailOrUsername: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrUsername, password }),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) throw new Error(data.error ?? 'Login failed');
    if (data.requires2FA) {
      return { requires2FA: true as const, pendingToken: data.pendingToken as string };
    }
    setState({ user: data.user, loading: false });
  }, []);

  const verify2FA = useCallback(async (pendingToken: string, code: string) => {
    const res = await fetch('/api/auth/2fa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingToken, code }),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) throw new Error(data.error ?? '2FA verification failed');
    setState({ user: data.user, loading: false });
  }, []);

  const register = useCallback(async (email: string, username: string, password: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password }),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) throw new Error(data.error ?? 'Registration failed');
    if (data.requiresVerification) {
      return { requiresVerification: true as const };
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setState({ user: null, loading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, verify2FA, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
