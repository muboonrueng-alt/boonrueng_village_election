import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F6F3EC",
        ink: "#1E2A38",
        ink70: "#3D4A5C",
        ink40: "#7C8898",
        brass: "#A9832E",
      },
      fontFamily: {
        serifThai: ['"Noto Serif Thai"', "serif"],
        sansThai: ['"IBM Plex Sans Thai"', "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
