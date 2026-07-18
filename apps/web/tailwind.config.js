/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: { sans: ["DM Sans", "system-ui", "sans-serif"] },
      colors: {
        surface: { DEFAULT: "#121416", elevated: "#1a1b1d" },
        accent: "#704db8",
      },
    },
  },
  plugins: [],
};
