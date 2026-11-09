import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const desktopDev = process.env.ATOM_DESKTOP_DEV === "1";

export default defineConfig({
  plugins: [react(), ...(desktopDev ? [{ name: "desktop-api-boundary", configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = request.url?.split("?")[0];
      if (!pathname?.startsWith("/api/") && !["/readyz", "/healthz"].includes(pathname)) return next();
      response.writeHead(403, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ error: "Open the native desktop application to use its planning service" }));
    });
  } }] : [])],
  test: {
    environment: "jsdom",
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    maxWorkers: 2,
    setupFiles: "./src/test/setup.js",
  },
  server: {
    ...(desktopDev ? { host: "127.0.0.1", strictPort: true,
      // Linux can report truncation before an editor finishes its write. Wait
      // briefly for complete bytes rather than publishing an empty stylesheet.
      watch: { awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 } },
      hmr: { host: "127.0.0.1", clientPort: 5173, protocol: "ws" } } : {}),
    proxy: desktopDev ? {} : {
      "/api": "http://localhost:8080",
      "/healthz": "http://localhost:8080",
      "/readyz": "http://localhost:8080",
    },
  },
});
