import '@testing-library/jest-dom';
import React from 'react';
import { vi } from 'vitest';

// Mock framer-motion pour jsdom (pas de support animations)
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get:
        (_target, prop) =>
        // Returns a "passthrough" component for each HTML element
        ({
          children,
          initial: _i,
          animate: _a,
          exit: _e,
          transition: _t,
          whileHover: _wh,
          whileTap: _wt,
          layout: _l,
          ...rest
        }: Record<string, unknown>) =>
          React.createElement(prop as string, rest, children as React.ReactNode),
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  useAnimation: () => ({ start: vi.fn(), stop: vi.fn() }),
  useInView: () => false,
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock next/link → simple <a>
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children as React.ReactNode),
}));

// Mock IntersectionObserver
globalThis.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock ResizeObserver
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
