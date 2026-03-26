'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { EnvProvider } from '@/contexts/EnvContext';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ErrorBoundary>
      <EnvProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </EnvProvider>
    </ErrorBoundary>
  );
}
