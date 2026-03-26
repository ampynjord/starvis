import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** Creates a QueryClient without retry for tests */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface WrapperOptions extends Omit<RenderOptions, 'wrapper'> {
  pathname?: string;
}

/** render() avec QueryClientProvider (Next.js navigation mockée dans setup.ts) */
export function renderWithProviders(
  ui: React.ReactElement,
  { pathname: _pathname = '/', ...options }: WrapperOptions = {},
) {
  const queryClient = makeQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper, ...options }), queryClient };
}

/** render() avec QueryClientProvider seulement (pour les composants sans router) */
export function renderWithQuery(ui: React.ReactElement, options?: RenderOptions) {
  const queryClient = makeQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { ...render(ui, { wrapper: Wrapper, ...options }), queryClient };
}

// Re-export utilities de testing-library
export * from '@testing-library/react';
export { renderWithProviders as render };
