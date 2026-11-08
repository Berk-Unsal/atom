import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    maxWorkers: 2,
    setupFiles: "./src/test/setup.js",
  },
  server: {
    ...(process.env.ATOM_DESKTOP_DEV === "1" ? { host: "127.0.0.1", strictPort: true, hmr: { host: "127.0.0.1", clientPort: 5173, protocol: "ws" } } : {}),
    proxy: {
      "/api": "http://localhost:8080",
      "/healthz": "http://localhost:8080",
      "/readyz": "http://localhost:8080",
    },
  },
});
