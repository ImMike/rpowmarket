import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        up: "#16a34a",
        down: "#dc2626",
        bg: "#0b0d12",
        panel: "#11141b",
        border: "#1f2430",
      },
    },
  },
  plugins: [],
} satisfies Config;
