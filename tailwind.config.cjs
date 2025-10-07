/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}'
  ],
  theme: {
    extend: {
      colors: {
        steam: {
          bg: '#0b0f15',
          panel: '#121824',
          card: '#1a2233',
          accent: '#1999ff',
        },
      },
    },
  },
  plugins: [],
};
