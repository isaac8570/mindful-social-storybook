/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sprout: {
          cream: "#FFF8F0",
          warm: "#F5E6D3",
          green: "#7BC67E",
          softgreen: "#A8D5A2",
          brown: "#8B6F5E",
          peach: "#FFCBA4",
        },
      },
      fontFamily: {
        story: ["Georgia", "serif"],
      },
    },
  },
  plugins: [],
}
