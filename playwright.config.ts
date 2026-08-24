import { defineConfig, devices } from "@playwright/test";

const localBaseUrl = "http://127.0.0.1:3000";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || localBaseUrl;
const useExternalServer = baseURL !== localBaseUrl;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: useExternalServer
    ? undefined
    : {
        command: "npm run dev",
        url: localBaseUrl,
        reuseExistingServer: !process.env.CI,
      },
});
