/**
 * End-to-end journeys J1-J8 (docs/attribution/00_DESIGN.md section 11), test mode only.
 *
 *   npm run test:e2e
 *
 * Playwright starts both servers itself (never reused): dev-api on :3001 (tests/e2e/test.env only,
 * outbound network fenced) and Vite on :5173 with ATTR_TEST=1 (tag stubs + proxy to dev-api).
 * Nothing here reaches the Google Sheet, Resend, Google Calendar, Meta or Grow.
 *
 * Projects run in this order (one worker, the file store is shared):
 *   failures  J6 + J9 (each test resets the store)
 *   setup     one reset, so the paying journeys start from an empty store
 *   journeys  J1-J5, J7, J8, then the section 11.4 report cross-check over all of them
 */
import { defineConfig, devices } from "@playwright/test";

// The servers must never see production variables (dev-api also refuses to start on them).
// NEW_PRICES=1: the bundle shows the 2.11.2026 table (tests/e2e/test.env sets it for dev-api too).
const serverEnv = { ATTR_TEST: "1", NEW_PRICES: "1" };

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:5173",
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "failures", testMatch: /(j6-failures|j9-grow-light|j10-debug|j11-site-[a-z]+)\.spec\.ts$/ },
    { name: "setup", testMatch: /reset\.setup\.ts$/, dependencies: ["failures"] },
    { name: "journeys", testMatch: /(j[1-578]-[a-z0-9-]+|z-report)\.spec\.ts$/, dependencies: ["setup"] },
  ],
  webServer: [
    {
      command: "npm run dev:api",
      url: "http://localhost:3001/__test/health",
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
      env: serverEnv,
    },
    {
      command: "npm run dev:test",
      url: "http://localhost:5173/",
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "pipe",
      env: serverEnv,
    },
  ],
});
