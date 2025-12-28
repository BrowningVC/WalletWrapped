/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#667eea', // Main purple
          600: '#5a67d8',
          700: '#4c51bf',
          800: '#434190',
          900: '#3c366b',
        },
        secondary: {
          500: '#764ba2', // Dark purple
          600: '#6a4391',
          700: '#5d3b80',
        },
        accent: {
          500: '#00ff88', // Neon green
          600: '#00e67a',
        },
        profit: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#10b981', // Green
          600: '#059669',
          700: '#047857',
        },
        loss: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444', // Red
          600: '#dc2626',
          700: '#b91c1c',
        },
        dark: {
          950: '#050508', // Deepest background
          900: '#0a0a12', // Background
          800: '#12121e', // Surface
          700: '#1a1a2a', // Elevated surface
          600: '#252538', // Borders
          500: '#333346', // Muted elements
        },
        festive: {
          gold: '#ffd700',
          pink: '#ff6b9d',
          purple: '#9d4edd',
          blue: '#4cc9f0',
          cyan: '#00f5d4',
          magenta: '#f72585',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-lexend)', 'Lexend', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-crypto': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'gradient-profit': 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        'gradient-loss': 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        'gradient-nye': 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        'gradient-nye-gold': 'linear-gradient(135deg, #ffd700 0%, #ff8c00 50%, #ff6347 100%)',
        'gradient-nye-party': 'linear-gradient(135deg, #f72585 0%, #7209b7 50%, #3a0ca3 100%)',
        'gradient-shimmer': 'linear-gradient(90deg, transparent 0%, rgba(255,215,0,0.3) 50%, transparent 100%)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slide-up 0.5s ease-out',
        'slide-down': 'slide-down 0.5s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'spin-slow': 'spin 3s linear infinite',
        'spin-reverse': 'spin-reverse 1.5s linear infinite',
        'sparkle': 'sparkle 1.5s ease-in-out infinite',
        'confetti': 'confetti 3s ease-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'shimmer': 'shimmer-slide 1.5s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': {
            opacity: '1',
            boxShadow: '0 0 20px rgba(102, 126, 234, 0.5)',
          },
          '50%': {
            opacity: '.8',
            boxShadow: '0 0 40px rgba(102, 126, 234, 0.8)',
          },
        },
        'slide-up': {
          '0%': {
            opacity: '0',
            transform: 'translateY(20px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        'slide-down': {
          '0%': {
            opacity: '0',
            transform: 'translateY(-20px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'sparkle': {
          '0%, 100%': { opacity: '0', transform: 'scale(0)' },
          '50%': { opacity: '1', transform: 'scale(1)' },
        },
        'confetti': {
          '0%': { transform: 'translateY(0) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(100px) rotate(720deg)', opacity: '0' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'shimmer-slide': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'spin-reverse': {
          '0%': { transform: 'rotate(360deg)' },
          '100%': { transform: 'rotate(0deg)' },
        },
      },
      boxShadow: {
        'glow': '0 0 20px rgba(102, 126, 234, 0.5)',
        'glow-lg': '0 0 40px rgba(102, 126, 234, 0.7)',
      },
    },
  },
  plugins: [],
};
