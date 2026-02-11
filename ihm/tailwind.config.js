/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Starvis palette — dark, modern, spacey
        sv: {
          dark: '#090d14',
          darker: '#050810',
          panel: '#0f1420',
          'panel-light': '#151c2c',
          border: '#1e2740',
          'border-light': '#2a3555',
          accent: '#4f8ff7',
          'accent-hover': '#3a7ae8',
          'accent-dim': '#2a5eb8',
          gold: '#f0b429',
          success: '#22c55e',
          danger: '#ef4444',
          warning: '#f59e0b',
          muted: '#5b6580',
          text: '#c8cfd9',
          'text-bright': '#edf0f5',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
