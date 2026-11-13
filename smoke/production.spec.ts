// S-22: after each deploy, sign in to production as the check account and open every app as a
// real organization, reading only. A failure means a person should look before customers do.
import { expect, test, type Page } from "@playwright/test";
import { readOnly, type Blocked } from "./read-only";

const EMAIL = process.env["SMOKE_EMAIL"];
const PASSWORD = process.env["SMOKE_PASSWORD"];
const BASE = (process.env["SMOKE_BASE_URL"] || "https://openapphub.org").replace(/\/+$/, "");

function appUrls(): Record<"charter" | "board" | "ledger", string> {
  const fromEnv = (() => {
    try {
      return JSON.parse(process.env["SMOKE_APP_URLS"] || "{}") as Record<string, string>;
    } catch {
      return {};
    }
  })();
  const host = new URL(BASE).host;
  return {
    charter: fromEnv["charter"] || `https://charter.${host}`,
    board: fromEnv["board"] || `https://board.${host}`,
    ledger: fromEnv["ledger"] || `https://ledger.${host}`,
  };
}

test.skip(!EMAIL || !PASSWORD, "Set SMOKE_EMAIL and SMOKE_PASSWORD (the check account).");

// The app cards' links on the dashboard ("Open Charter"…), src/config/apps.ts.
const SHORT = { charter: "Charter", board: "Board", ledger: "Ledger" } as const;

let blocked: Blocked[] = [];
const pageErrors: string[] = [];

async function dismissCookies(page: Page) {
  const reject = page.getByRole("button", { name: "Reject non-essential" });
  if (await reject.isVisible().catch(() => false)) await reject.click();
}

async function noErrorScreen(page: Page) {
  await expect(page.getByText(/something went wrong|unexpected error/i)).toHaveCount(0);
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  blocked = await readOnly(page);
  page.on("pageerror", (e) => pageErrors.push(`${page.url()}: ${e.message}`));
});

test.afterEach(() => {
  expect(blocked, "the smoke test tried to change something").toEqual([]);
});

test("the suite works on production for a real organization", async ({ page }) => {
  // Sign in at the hub.
  await page.goto(`${BASE}/login`);
  // Wait for the page to be live (a field filled before that is cleared again).
  await page.waitForLoadState("networkidle");
  await dismissCookies(page);
  const email = page.getByLabel("Email");
  await expect(async () => {
    await email.fill(EMAIL!);
    await expect(email).toHaveValue(EMAIL!, { timeout: 1000 });
  }).toPass();
  await page.getByLabel("Password").fill(PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Welcome/ })).toBeVisible();
  await noErrorScreen(page);

  // The hub's own pages.
  for (const [path, heading] of [
    ["/members", /Members/],
    ["/automations", /Automations/],
    ["/settings", /Settings|Organization/],
    ["/account", /Your account/],
  ] as const) {
    await page.goto(`${BASE}${path}`);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await noErrorScreen(page);
  }

  // The organization the check account belongs to, from the dashboard's app cards.
  await page.goto(`${BASE}/`);
  await expect(page.getByRole("heading", { name: /^Welcome/ })).toBeVisible();
  const urls = appUrls();
  const targets: Array<[string, string]> = [];
  for (const app of ["charter", "board", "ledger"] as const) {
    // The hub's own link (it knows each app's address, with the organization); else the default.
    const link = page.getByRole("link", { name: `Open ${SHORT[app]}`, exact: true });
    const href = (await link.count()) ? await link.getAttribute("href") : null;
    targets.push([app, href ?? urls[app]]);
  }
  for (const [app, target] of targets) {
    await test.step(`open ${app}`, async () => {
      await page.goto(target);
      // Signed in through the suite: the app's frame, not a sign-in page.
      await expect(page.getByRole("button", { name: /Switch app/ })).toBeVisible();
      await expect(page.getByRole("heading", { name: /^Sign in/ })).toHaveCount(0);
      await noErrorScreen(page);
    });
  }

  expect(pageErrors, "no script errors on the pages").toEqual([]);
});
