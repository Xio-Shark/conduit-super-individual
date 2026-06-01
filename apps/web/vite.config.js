import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT || 5173),
    strictPort: process.env.WEB_STRICT_PORT === "true",
    proxy: {
      "/api": process.env.API_TARGET || "http://localhost:3001",
    },
  },
});
