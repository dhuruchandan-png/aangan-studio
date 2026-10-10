import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        plaster: '#F4EEE4',
        paper: '#FBF8F2',
        ink: '#2B2620',
        terracotta: '#B8573A',
        'terracotta-deep': '#9E4529',
        teak: '#7A4E2D',
        sage: '#6F8A6E',
        'sage-deep': '#4F6A4E',
        indigo: '#2F4A6D',
        brass: '#B8913F',
        'brass-deep': '#7F6320',
        clay: '#E7D8C6',
        muted: '#6B6157',
        alert: '#A83A2C',
        espresso: '#1C1713',
        'espresso-2': '#2A221B',
        ivory: '#FFFDF9',
        gold: '#D9B45B',
      },
      fontFamily: {
        serif: ['var(--font-fraunces)', 'Georgia', 'serif'],
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: { card: '0 1px 2px rgba(43,38,32,.06), 0 8px 24px -12px rgba(43,38,32,.18)', lift: '0 2px 4px rgba(43,38,32,.08), 0 18px 40px -16px rgba(43,38,32,.28)' },
      letterSpacing: { drawing: '0.14em' },
      keyframes: {
        settle: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'none' } },
        slidein: { '0%': { opacity: '0', transform: 'translateX(-10px)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: { settle: 'settle 260ms ease-out both', slidein: 'slidein 240ms ease-out both' },
    },
  },
  plugins: [],
};
export default config;
