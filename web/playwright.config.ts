import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build served by "vite preview".
 * Phase 1 uses Chromium only. Firefox and WebKit join in Phase 10.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Many browsers at once overload some machines, and their page loads stall. Four is safe.
  workers: process.env.CI ? undefined : 4,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    // Use the IPv4 loopback address. On some Windows machines, security software makes
    // parallel browser requests to "localhost" (IPv6 ::1) stall at random.
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && pnpm preview --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
