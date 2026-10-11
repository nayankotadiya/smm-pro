/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"], .dark'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        canvas: v('canvas'),
        surface: {
          DEFAULT: v('surface'),
          2: v('surface-2'),
          3: v('surface-3'),
          raised: v('surface-raised'),
        },
        line: {
          DEFAULT: v('line'),
          strong: v('line-strong'),
        },
        ink: {
          DEFAULT: v('ink'),
          2: v('ink-2'),
          3: v('ink-3'),
        },
        primary: {
          DEFAULT: v('primary'),
          hover: v('primary-hover'),
          soft: v('primary-soft'),
          ink: v('primary-ink'),
        },
        success: {
          DEFAULT: v('success'),
          hover: v('success-hover'),
          soft: v('success-soft'),
          ink: v('success-ink'),
        },
        warning: {
          DEFAULT: v('warning'),
          soft: v('warning-soft'),
          ink: v('warning-ink'),
        },
        danger: {
          DEFAULT: v('danger'),
          soft: v('danger-soft'),
          ink: v('danger-ink'),
        },
        inverse: {
          DEFAULT: v('inverse'),
          ink: v('on-inverse'),
        },
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
        pop: 'var(--shadow-pop)',
      },
    },
  },
  plugins: [],
};
