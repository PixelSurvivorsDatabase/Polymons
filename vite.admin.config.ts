import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "admin/renderer",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../../admin-dist/renderer",
    emptyOutDir: false,
  },
});
