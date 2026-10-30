import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const version = readFileSync(new URL("../VERSION", import.meta.url), "utf8").trim();
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version) || !/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid build identity");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "docs-hero-capture.spec.js",
  workers: 1,
  retries: 0,
  timeout: 120_000,
  use: { baseURL: "http://127.0.0.1:18080", trace: "retain-on-failure" },
  projects: [{ name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npm run build && cd ../backend-go && BIND_ADDRESS=127.0.0.1 PORT=18080 FRONTEND_DIST_PATH=../frontend-react/dist GOTOOLCHAIN=go1.26.10 go run -ldflags '-X main.appVersion=${version} -X main.buildCommit=${commit}' .`,
    url: "http://127.0.0.1:18080/readyz",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
