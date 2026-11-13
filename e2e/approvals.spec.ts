import { expect, test } from "@playwright/test";

// Approvals (core 0014, C-08) on the dev preview: the designer's "Ask for approval" step, and an
// approval's own page. Nothing is saved: the preview has no database.
test("an approval says what's pending, how it's decided, and takes an answer", async ({ page }) => {
  await page.goto("/dev/hub?screen=approval");
  const reject = page.getByRole("button", { name: "Reject non-essential" });
  await reject.click({ timeout: 10_000 }).catch(() => {});
  await expect(
    page.getByRole("heading", { name: "An award submission from Pat Lee" }),
  ).toBeVisible();
  await expect(page.getByText("Everyone asked must approve")).toBeVisible();
  await expect(page.getByText("Award routing")).toBeVisible();
  await expect(page.getByText('"Eligible"')).toBeVisible();
  await expect(async () => {
    await page.getByLabel("Comment (optional)").fill("Fine by me", { timeout: 1000 });
    await page.getByRole("button", { name: "Approve" }).click({ timeout: 1000 });
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
});

test("the designer's Ask for approval step: what, who, how it's decided, time to answer", async ({
  page,
}) => {
  await page.goto("/dev/hub?screen=designer");
  const first = page.getByRole("button", { name: "Add the first step here" });
  const menu = page.getByLabel("Add a step", { exact: true });
  await expect(async () => {
    if (!(await menu.isVisible())) await first.click({ timeout: 1000 });
    await expect(menu).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await menu.press("Escape");
  await page.getByLabel("What starts it").focus();
  const reject = page.getByRole("button", { name: "Reject non-essential" });
  await reject.click({ timeout: 10_000 }).catch(() => {});
  await expect(reject).toBeHidden();
  await first.click();
  await page.getByLabel("Add a step", { exact: true }).selectOption("approval");
  await page.getByLabel("What needs approving").fill("An award submission");
  await page.getByLabel("When several people are asked").selectOption("all");
  await page.getByLabel("Days to answer (optional)").fill("3");
  await expect(page.getByRole("region", { name: "In plain words" })).toContainText(
    'Ask for approval: "An award submission" (everyone must approve, 3 days to answer)',
  );
});
