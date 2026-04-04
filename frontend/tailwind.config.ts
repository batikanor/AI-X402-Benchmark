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
        bg: "#1f1d1a",
        panel: "#2b2924",
        soft: "#353129",
        accent: "#6a7448",
        accent2: "#869160",
      },
      boxShadow: {
        glow: "0 2px 14px rgba(0,0,0,0.28)",
      },
    },
  },
  plugins: [],
};

export default config;
