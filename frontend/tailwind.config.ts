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
        bg: "#001f1e",
        panel: "#052927",
        soft: "#0b332f",
        accent: "#14b8a6",
        accent2: "#2dd4bf",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.08), 0 18px 40px rgba(0,0,0,0.36)",
      },
    },
  },
  plugins: [],
};

export default config;
