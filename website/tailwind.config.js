/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
        mono: ['"Fira Code"', 'Consolas', 'monospace'],
      },
      colors: {
        brand: {
          bg: '#04060a',
          card: '#080c14',
          border: 'rgba(255, 255, 255, 0.06)',
          accent: '#8b5cf6',
          violet: '#a78bfa',
          indigo: '#818cf8',
          blue: '#60a5fa',
        }
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
