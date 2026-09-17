import { defineConfig, devices } from "@playwright/test";

const realBackendE2E = process.env.ATOM_REAL_E2E === "1";
const e2eBaseURL = realBackendE2E ? "http://127.0.0.1:18080" : "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: e2eBaseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "desktop-1024", use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } } },
    { name: "tablet-768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "mobile-390", use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: realBackendE2E
    ? {
      command: "npm run build && cd ../backend-go && PORT=18080 FRONTEND_DIST_PATH=../frontend-react/dist go run .",
      url: "http://127.0.0.1:18080/readyz",
      reuseExistingServer: false,
      timeout: 120_000,
    }
    : {
      command: "npm run dev -- --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
});
