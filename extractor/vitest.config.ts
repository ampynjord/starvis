import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['node_modules/**', 'tests/**', 'dist/**', '**/*.config.*', '**/index.ts'],
      thresholds: {
        lines: 4,
        functions: 2,
        branches: 4,
        statements: 4,
      },
    },
  },
});
