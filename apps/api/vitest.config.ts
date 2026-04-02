import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      DB_HOST: 'localhost',
      DB_PORT: '3306',
      DB_USER: 'test',
      DB_PASSWORD: 'test',
      DB_NAME: 'starvis',
      NODE_ENV: 'test',
    },
  },
});
