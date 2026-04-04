import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0b1020",
        panel: "#121a30",
        soft: "#1a2442",
        accent: "#2bd4bd",
        accent2: "#6ee7ff",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(110,231,255,0.12), 0 24px 60px rgba(14,165,233,0.15)",
      },
    },
  },
  plugins: [],
};

export default config;
