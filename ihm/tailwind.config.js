/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#050B14',
        panel: '#0A1628',
        border: {
          DEFAULT: '#1A3A5C',
          bright: '#2A5F8F',
        },
        cyan: {
          50: '#E0FFFE',
          100: '#B8FFFE',
          200: '#7BFFFE',
          300: '#3CF7FD',
          400: '#00D4FF',
          500: '#00B4D8',
          600: '#0096B7',
          700: '#006F87',
          800: '#005068',
          900: '#003B4D',
          950: '#001F2D',
        },
        amber: {
          400: '#FFB800',
          500: '#E5A500',
        },
        neon: {
          green: '#00FF88',
          red: '#FF4444',
          blue: '#00D4FF',
        },
      },
      fontFamily: {
        orbitron: ['Orbitron', 'sans-serif'],
        rajdhani: ['Rajdhani', 'sans-serif'],
        mono: ['"Share Tech Mono"', '"JetBrains Mono"', 'monospace'],
      },
      animation: {
        scanline: 'scanline 4s linear infinite',
        pulse_slow: 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        glow: 'glow 2s ease-in-out infinite alternate',
        flicker: 'flicker 0.15s infinite',
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        glow: {
          from: { textShadow: '0 0 5px #00D4FF, 0 0 10px #00D4FF' },
          to: { textShadow: '0 0 10px #00D4FF, 0 0 25px #00D4FF, 0 0 40px #00D4FF' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.92' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backgroundImage: {
        'grid-void': `
          linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)
        `,
      },
      backgroundSize: {
        'grid-void': '40px 40px',
      },
      boxShadow: {
        'cyan-glow': '0 0 10px rgba(0,212,255,0.3), 0 0 30px rgba(0,212,255,0.1)',
        'amber-glow': '0 0 10px rgba(255,184,0,0.3), 0 0 30px rgba(255,184,0,0.1)',
        'panel': '0 4px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(0,212,255,0.1)',
        'panel-hover': '0 8px 32px rgba(0,0,0,0.8), 0 0 20px rgba(0,212,255,0.15)',
      },
    },
  },
  plugins: [],
};
