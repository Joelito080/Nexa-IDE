/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        nexus: {
          bg:              '#080909',
          surface:         '#0f1117',
          panel:           '#0d0e14',
          elevated:        '#1a1b2a',
          border:          'rgba(139, 92, 246, 0.12)',
          'border-active': 'rgba(139, 92, 246, 0.45)',
          'border-subtle': 'rgba(255, 255, 255, 0.06)',
          accent:          '#8b5cf6',
          'accent-bright': '#a78bfa',
          'accent-blue':   '#60a5fa',
          'accent-cyan':   '#22d3ee',
          'accent-indigo': '#6366f1',
          glow:            'rgba(139, 92, 246, 0.35)',
          'glow-blue':     'rgba(96, 165, 250, 0.35)',
          text:            '#f1f5f9',
          'text-secondary':'#94a3b8',
          'text-muted':    '#475569',
          'text-faint':    '#2d3748',
          success:         '#4ade80',
          warning:         '#fbbf24',
          error:           '#f87171',
          info:            '#60a5fa',
        },
      },
      fontFamily: {
        sans:  ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono:  ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '1.4' }],
        'xs':  ['11px', { lineHeight: '1.5' }],
        'sm':  ['12px', { lineHeight: '1.5' }],
        'base':['13px', { lineHeight: '1.6' }],
      },
      animation: {
        'pulse-slow':     'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'gradient-shift': 'gradientShift 18s ease infinite',
        'float':          'float 6s ease-in-out infinite',
        'glow-pulse':     'glowPulse 2.5s ease-in-out infinite alternate',
        'slide-in-left':  'slideInLeft 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'fade-in':        'fadeIn 0.4s ease-out',
        'scan':           'scan 4s linear infinite',
      },
      keyframes: {
        gradientShift: {
          '0%':   { backgroundPosition: '0% 50%' },
          '50%':  { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':       { transform: 'translateY(-10px)' },
        },
        glowPulse: {
          '0%':   { boxShadow: '0 0 5px rgba(139, 92, 246, 0.15), 0 0 10px rgba(139, 92, 246, 0.08)' },
          '100%': { boxShadow: '0 0 20px rgba(139, 92, 246, 0.5), 0 0 40px rgba(139, 92, 246, 0.25)' },
        },
        slideInLeft: {
          from: { transform: 'translateX(-20px)', opacity: '0' },
          to:   { transform: 'translateX(0)',     opacity: '1' },
        },
        slideInRight: {
          from: { transform: 'translateX(20px)', opacity: '0' },
          to:   { transform: 'translateX(0)',    opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        scan: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(200%)' },
        },
      },
    },
  },
  plugins: [],
}
