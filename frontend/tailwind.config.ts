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
        panel: "#062c27",
        soft: "#0c3a34",
        accent: "#2ccba6",
        accent2: "#68e5c8",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(104,229,200,0.16), 0 24px 54px rgba(9,64,53,0.32)",
      },
    },
  },
  plugins: [],
};

export default config;
