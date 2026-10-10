/** @type {import('tailwindcss').Config} */

// Colours are CSS variables (RGB triplets) defined in app/globals.css so the
// whole palette flips for dark mode. Tokens mirror the owner's website
// ("Executive Editorial" design system).
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

module.exports = {
  darkMode: 'class',
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // surfaces
        canvas: v('canvas'),
        vellum: v('vellum'),
        recess: v('recess'),
        wash: v('wash'),
        // inks
        ink: {
          DEFAULT: v('ink'),
          hover: v('ink-hover'),
          2: v('ink-2'),
          3: v('ink-3'),
        },
        // accents
        terra: {
          DEFAULT: v('terra'),
          dk: v('terra-dk'),
          pale: v('terra-pale'),
          lt: v('terra-lt'),
        },
        sage: {
          DEFAULT: v('sage'),
          pale: v('sage-pale'),
        },
        critical: {
          DEFAULT: v('critical'),
          pale: v('critical-pale'),
        },
        // lines (already include alpha)
        hair: {
          DEFAULT: 'var(--hair)',
          2: 'var(--hair-2)',
          hot: 'var(--hair-hot)',
        },
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Georgia', 'Times New Roman', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        btn: '4px',
        card: '6px',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        lift: 'var(--shadow-lift)',
      },
      transitionTimingFunction: {
        editorial: 'cubic-bezier(.16,1,.3,1)',
      },
      screens: {
        xs: '360px',
      },
      animation: {
        'slide-in': 'slide-in 0.5s cubic-bezier(.16,1,.3,1)',
        'fade-up': 'fade-up 0.6s cubic-bezier(.16,1,.3,1) both',
        'dot-pulse': 'dot-pulse 2.6s ease-in-out infinite',
      },
      keyframes: {
        'slide-in': {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-up': {
          from: { transform: 'translateY(10px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'dot-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 3px rgb(var(--terra) / .18)' },
          '50%': { boxShadow: '0 0 0 6px rgb(var(--terra) / 0)' },
        },
      },
    },
  },
  plugins: [],
}
