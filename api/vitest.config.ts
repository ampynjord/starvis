import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['node_modules/**', 'tests/**', 'dist/**', '**/*.config.{js,ts}', '**/*.d.ts', '**/index.ts'],
      thresholds: {
        lines: 35,
        functions: 35,
        branches: 18,
        statements: 35,
      },
    },
  },
});
