import { defineConfig, devices } from "@playwright/test";

// E2E smoke config (M-10). Runs the route-render suite in tests/e2e against a
// RUNNING server (dev or a deployed URL) — it does not start one for you.
//
//   PLAYWRIGHT_BASE_URL   the app to hit (default http://localhost:3000)
//   DEV_QA_BYPASS_TOKEN   must equal the server's, so the run can bypass auth
//   E2E_STORE_ID          optional active_store_id so store-scoped pages load
//                         their real data instead of the onboarding gate
//
// Run:  npm run test:e2e     (after `npm run dev` in another terminal)
//
// Kept separate from `npm test` (unit) because it needs a live server + a
// browser; unit tests stay fast and dependency-free.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"]
  }
});
