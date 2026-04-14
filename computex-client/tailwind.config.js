/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Poppins", "ui-sans-serif", "system-ui"],
      },
      animation: {
          "bounce-slow": "bounce 2s infinite",
      },
    },
  },
  darkMode: "class",
  plugins: [],
};
