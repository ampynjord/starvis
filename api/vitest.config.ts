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
        lines: 30,
        functions: 40,
        branches: 13,
        statements: 30,
      },
    },
  },
});
