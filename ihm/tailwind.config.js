/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Star Citizen inspired palette
        sc: {
          dark: '#0a0e17',
          darker: '#060912',
          panel: '#111827',
          border: '#1f2937',
          accent: '#3b82f6',
          'accent-hover': '#2563eb',
          gold: '#f59e0b',
          success: '#10b981',
          danger: '#ef4444',
          muted: '#6b7280',
          text: '#e5e7eb',
          'text-bright': '#f9fafb',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
