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
        bg: "#2a2a28",
        panel: "#3a3a37",
        soft: "#323230",
        accent: "#4b6845",
        accent2: "#5a7b54",
      },
      boxShadow: {
        glow: "0 2px 14px rgba(0,0,0,0.28)",
      },
    },
  },
  plugins: [],
};

export default config;
