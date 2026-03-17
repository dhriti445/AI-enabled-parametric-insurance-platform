/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Sora', 'sans-serif'],
        body: ['Manrope', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#ecf7f6',
          100: '#d8efec',
          500: '#1f8f86',
          700: '#11635d',
          900: '#0a3734',
        },
        accent: {
          500: '#ff7a45',
          700: '#d65c2f',
        },
      },
      boxShadow: {
        soft: '0 20px 45px -20px rgba(17, 99, 93, 0.45)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        rise: 'rise 0.65s ease-out forwards',
      },
    },
  },
  plugins: [],
};
