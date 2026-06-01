import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:16421",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: process.env.E2E_SKIP_SERVER
    ? undefined
    : {
        command: "API_PORT=16422 WEB_PORT=16421 WEB_STRICT_PORT=true API_TARGET=http://localhost:16422 npm run dev",
        url: "http://localhost:16421",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
