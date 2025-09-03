/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        roboto: ["Roboto", "ui-sans-serif", "system-ui"],
      },
      colors: {
        gcNavy: "#143761",
        gcButton: "#10365B",
        gcGreen: "#44B86E",
      },
    },
  },
  plugins: [],
};
