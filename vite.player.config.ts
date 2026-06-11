import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "player/renderer",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../../player-dist/renderer",
    emptyOutDir: false,
  },
});
