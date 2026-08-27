import { defineConfig, devices } from "@playwright/test";

/**
 * The chrome's geometry is a contract, not a look: Epic 2 pins its action bar
 * at `top: 39px`, so a drifting bar height opens a gap or an overlap on every
 * posting screen. Nothing short of a real layout pass can measure that, which
 * is why this suite exists alongside the Node unit tests rather than instead
 * of them.
 *
 * Runs against a production build — `next dev` reflows on compile and would
 * measure a bar that never ships. `pnpm verify` builds first, then runs this.
 */
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
