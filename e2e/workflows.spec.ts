import { expect, test, type Page } from "@playwright/test";

// The workflow builder (S-25) with real clicks, on the dev preview's sample catalog
// (src/lib/workflow-fixture.ts: what the apps register).
async function openBuilder(page: Page) {
  await page.goto("/dev/hub?screen=workflow");
  await expect(page.locator("#wf-trigger")).toBeVisible();
  // The page hydrates before the selects respond.
  await expect(async () => {
    await page.selectOption("#wf-trigger", "charter.payment_received");
    await expect(page.getByText("When a dues or other payment is paid.")).toBeVisible({
      timeout: 1000,
    });
  }).toPass();
}

test("builds award routing by rank, read back in plain words", async ({ page }) => {
  await openBuilder(page);
  await page.fill("#wf-name", "Award routing");
  await page.getByRole("button", { name: "Add If" }).click();
  await page.selectOption("#branch-0-c0-field", "member.fields.rank");
  await page.selectOption("#branch-0-c0-op", "lte");
  await page.selectOption("#branch-0-c0-value", "PFC");
  await page.selectOption("#branch-0-add", "task");
  await page
    .getByRole("group", { name: "If #1" })
    .getByRole("button", { name: "Add", exact: true })
    .click();
  await page.selectOption("#branch-0-a0-to-type", "charter.seat");
  // The organization's seats are offered by the app.
  await page.selectOption("#branch-0-a0-to-p-seat", "president");
  await page.fill("#branch-0-a0-title", "Review {{member.name}}");
  await page.getByRole("button", { name: "Add Else if" }).click();
  await page.selectOption("#branch-1-c0-field", "member.fields.rank");
  await page.selectOption("#branch-1-c0-op", "between");
  await page.selectOption("#branch-1-c0-value", "SPC");
  await page.selectOption("#branch-1-c0-value2", "SFC");
  await page.selectOption("#branch-1-add", "task");
  await page
    .getByRole("group", { name: "Else if #2" })
    .getByRole("button", { name: "Add", exact: true })
    .click();
  await page.selectOption("#branch-1-a0-to-type", "charter.seat");
  await page.selectOption("#branch-1-a0-to-p-seat", "president");
  await page.selectOption("#branch-1-a0-to-p-level", "region");
  await page.fill("#branch-1-a0-title", "Review {{member.name}}");
  const words = page.getByRole("region", { name: "In plain words" });
  await expect(words).toContainText("When: A payment is received.");
  await expect(words).toContainText(
    "If Rank is at most PFC: give their chapter's president a task.",
  );
  await expect(words).toContainText(
    "Else if Rank is between SPC and SFC: give their region's president a task.",
  );
  await expect(page.getByRole("button", { name: "Save workflow" })).toBeEnabled();
});

test("adds the financial reports to a meeting, as of the last closed month", async ({ page }) => {
  await openBuilder(page);
  await page.fill("#wf-name", "Reports before meetings");
  await page.selectOption("#wf-trigger", "board.meeting_upcoming");
  await page.fill("#wf-trigger-days_before", "5");
  await page.selectOption("#always-add", "ledger.reports_to_meeting");
  await page
    .getByRole("region", { name: "Always" })
    .getByRole("button", { name: "Add", exact: true })
    .click();
  await page.selectOption("#always-a0-as_of", "last_closed_month");
  await expect(page.getByRole("region", { name: "In plain words" })).toContainText(
    "Always: add the financial reports to the meeting, as of the last closed month.",
  );
  await page.selectOption("#always-a0-as_of", "date");
  await expect(page.locator("#always-a0-date")).toBeVisible();
});

test("won't save until it's complete, and says why", async ({ page }) => {
  await openBuilder(page);
  const words = page.getByRole("region", { name: "In plain words" });
  await expect(words).toContainText("Give the workflow a name.");
  await expect(words).toContainText("Add at least one thing to do (Then).");
  await expect(page.getByRole("button", { name: "Save workflow" })).toBeDisabled();
});
