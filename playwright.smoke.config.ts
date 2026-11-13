import { defineConfig, devices } from "@playwright/test";

/**
 * S-22: the production smoke test. Read-only, against the live suite (openapphub.org and the
 * apps), signed in as a dedicated check account. Run: `npm run test:smoke:prod` with
 * SMOKE_EMAIL and SMOKE_PASSWORD set (GitHub secrets in CI; never commit them).
 * SMOKE_BASE_URL (default https://openapphub.org) and SMOKE_APP_URLS (JSON, like
 * VITE_SUITE_URLS) point it elsewhere, e.g. at staging.
 */
const chromiumPath = process.env["E2E_CHROMIUM_PATH"] || undefined;

export default defineConfig({
  testDir: "smoke",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env["SMOKE_BASE_URL"] || "https://openapphub.org",
    // Never kept: a trace would hold the check account's password.
    trace: "off",
    screenshot: "off",
    launchOptions: {
      chromiumSandbox: process.env["E2E_NO_SANDBOX"] !== "1",
      ...(chromiumPath ? { executablePath: chromiumPath } : {}),
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
