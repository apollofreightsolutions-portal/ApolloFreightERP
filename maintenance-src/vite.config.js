import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/maintenance/",
  build: {
    outDir: "../web/maintenance",
    emptyOutDir: true
  },
  plugins: [react()],
  server: {
    port: 5173
  }
});
