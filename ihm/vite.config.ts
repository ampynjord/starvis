import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
      '/admin': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
    },
  },
})
