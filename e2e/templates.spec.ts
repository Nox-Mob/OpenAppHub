import { expect, test } from "@playwright/test";

// The template gallery on the Automations page, on the dev preview's sample catalog
// (src/lib/workflow-fixture.ts): only some apps' triggers and steps are there.
test("a template opens in the designer, ready to adjust and save", async ({ page }) => {
  await page.goto("/dev/hub?screen=templates");
  const gallery = page.getByRole("region", { name: "Start from a template" });
  await expect(gallery).toBeVisible();
  // Waiting for a feature still to come: elections (S-23) and awards.
  const election = gallery.locator('[data-template="election_results"]');
  await expect(election).toContainText("Coming with elections in OpenCharterApp");
  await expect(election.getByRole("button")).toHaveCount(0);
  // The sample catalog has no "membership lapses" trigger: that one says what it needs.
  await expect(gallery.locator('[data-template="lapse_notice"]')).toContainText(
    "Needs OpenCharterApp",
  );

  const use = gallery.getByRole("button", {
    name: "Use the template: Financial reports before each meeting",
  });
  await expect(async () => {
    await use.click({ timeout: 1000 });
    await expect(page.getByLabel("Name", { exact: true })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Financial reports before each meeting",
  );
  await expect(page.getByLabel("What starts it")).toHaveValue("board.meeting_upcoming");
  await expect(page.getByRole("region", { name: "In plain words" })).toContainText(
    "Add the reports",
  );
});
