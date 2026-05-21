// Playwright config for the CUJ-level browser probes. Tests live in
// tests/browser/ and run against $PROBE_URL (defaults to the live
// production deploy). Two paths:
//   - GitHub Actions PR workflow runs these on every PR (non-blocking
//     during the bake-in period; see .github/workflows/...)
//   - GitHub Actions cron workflow runs these every 30 min against
//     prod and pushes results to Grafana
//
// Local invocation:
//   PROBE_URL=https://zrh.vv.mk npx playwright test
//
// JSON reporter writes to results.json — consumed by the
// scripts/push-playwright-to-grafana.sh push step.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: 1,
  workers: 1, // serial — probes shouldn't load the live service
  reporter: [
    ["list"],
    ["json", { outputFile: "results.json" }],
  ],
  use: {
    baseURL: process.env.PROBE_URL || "https://zrh.vv.mk",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
