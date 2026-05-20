/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: { sans: ["DM Sans", "system-ui", "sans-serif"] },
      colors: {
        surface: { DEFAULT: "#12121a", elevated: "#1a1a26" },
        accent: "#8b5cf6",
      },
    },
  },
  plugins: [],
};
