/** @type {import('tailwindcss').Config} */
export default {
  // v3 needs the source globs spelled out; v4 discovered them on its own.
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b1020",
        panel: "#141b2f",
        "panel-soft": "#1c2540",
        line: "#263252",
        accent: "#5b8cff",
        "accent-soft": "#2b3f78",
        muted: "#93a1c4",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
};
