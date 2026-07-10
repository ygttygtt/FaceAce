/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#faf5ec",
          100: "#f4ebd9",
          200: "#e9d7b3",
          300: "#ddc38d",
          400: "#d4af6a",
          500: "#c49a45",
          600: "#b08030",
          700: "#8c6426",
          800: "#6b4c1d",
          900: "#4a3414",
        },
        surface: {
          DEFAULT: "#fafaf9",
          raised: "#ffffff",
          overlay: "#f5f5f4",
        },
        ink: {
          DEFAULT: "#1c1917",
          muted: "#78716c",
          subtle: "#a8a29e",
          invert: "#ffffff",
        },
      },
      fontFamily: {
        sans: ['"Inter"', '"Noto Sans SC"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      borderRadius: {
        DEFAULT: "0.625rem",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        elevated: "0 4px 6px -1px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
      },
    },
  },
  plugins: [],
};
