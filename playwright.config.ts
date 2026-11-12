import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests for the hub's screens, on the dev server's preview routes (/dev/hub, sample data,
 * no backend): the workflow builder and other screens with real clicks. Run: `npm run test:e2e`.
 * E2E_CHROMIUM_PATH points at a local Chromium; E2E_NO_SANDBOX=1 where only root is available.
 */
const PORT = Number(process.env["E2E_PORT"] ?? 4321);
const chromiumPath = process.env["E2E_CHROMIUM_PATH"] || undefined;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: {
      chromiumSandbox: process.env["E2E_NO_SANDBOX"] !== "1",
      ...(chromiumPath ? { executablePath: chromiumPath } : {}),
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite dev --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/dev/hub?screen=workflow`,
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
  },
});
