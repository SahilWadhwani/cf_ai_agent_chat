import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/agents": { target: "http://localhost:8787", changeOrigin: true, ws: true },
      "/tools":  { target: "http://localhost:8787", changeOrigin: true }
    },
  },
});