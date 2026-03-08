/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './views/**/*.hbs',
    './public/assets/js/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#075E54',
        secondary: '#128C7E',
        accent: '#1eb854',
        'whatsapp-bg': '#ECE5DD',
      },
    },
  },
  plugins: [],
};
