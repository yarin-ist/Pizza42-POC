/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Brand / pizza actions — Tomato Red
        brand: {
          DEFAULT: '#ef4444', // red-500
          dark: '#dc2626',    // red-600
          light: '#fca5a5',   // red-300
        },
        // Identity / auth actions — Electric Indigo
        identity: {
          DEFAULT: '#6366f1', // indigo-500
          dark: '#4f46e5',    // indigo-600
          light: '#a5b4fc',   // indigo-300
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
