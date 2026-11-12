import { expect, test, type Page } from "@playwright/test";

// H-09: roles in each app, named roles and invitations, on the dev preview's sample people
// (src/lib/roles-fixture.ts). Nothing is saved: the preview has no database.
async function openRoles(page: Page) {
  await page.goto("/dev/hub?screen=roles");
  await expect(page.getByRole("heading", { name: "Roles in each app" })).toBeVisible();
  // Hydrated once a click opens the editor.
  const create = page.getByRole("button", { name: "Create role" });
  await expect(async () => {
    if (!(await create.isVisible()))
      await page.getByRole("button", { name: "New named role" }).click({ timeout: 1000 });
    await expect(create).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  // The cookie banner (shown once the page is interactive) sits over the bottom of the page.
  const reject = page.getByRole("button", { name: "Reject non-essential" });
  await reject.click({ timeout: 10_000 }).catch(() => {});
  await expect(reject).toBeHidden();
  await page.getByRole("button", { name: "Cancel" }).click();
}

test("each app's role is separate, and shows where it comes from", async ({ page }) => {
  await openRoles(page);
  // An OpenAppHub admin with nothing set is a viewer in the apps, and it says so.
  const ledger = page.getByLabel("Ada Admin in OpenLedgerApp");
  await expect(ledger).toHaveValue("");
  await expect(ledger.locator("option:checked")).toHaveText("Not set: viewer");
  await expect(page.getByLabel("Ada Admin in OpenBoardApp")).toHaveValue("admin");
  // The treasurer's roles come from the named role.
  await expect(page.getByLabel("Terry Treasurer's named role")).toHaveValue("nr-treasurer");
  await expect(
    page.getByLabel("Terry Treasurer in OpenLedgerApp").locator("option:checked"),
  ).toHaveText("From Treasurer: Admin");
});

test("a named role sets a role per app and extra permissions", async ({ page }) => {
  await openRoles(page);
  await page.getByRole("button", { name: "New named role" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Awards clerk");
  const editor = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Create role" }) });
  await editor.getByLabel("OpenCharterApp").selectOption("member");
  await expect(editor.getByText("Uses the app and makes changes")).toBeVisible();
  await editor.getByLabel(/See payments/).check();
  // An admin already has every permission in the app, so there's nothing extra to choose.
  await editor.getByLabel("OpenLedgerApp").selectOption("admin");
  await expect(editor.getByLabel(/Close the books/)).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Create role" })).toBeEnabled();
});

test("an invitation chooses the named role and each app's role", async ({ page }) => {
  await openRoles(page);
  const invite = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Send invitation" }) });
  await expect(invite.getByText(/Sees the dashboard and their tasks/)).toBeVisible();
  await invite.getByLabel("Named role").selectOption("nr-treasurer");
  await expect(invite.getByLabel("OpenLedgerApp").locator("option:checked")).toHaveText(
    "From Treasurer: Admin",
  );
  await invite.getByLabel("OpenBoardApp").selectOption("viewer");
  await invite.getByLabel("Email").fill("new.person@example.org");
  await invite.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Invitation sent to new.person@example.org.")).toBeVisible();
});

test("letting someone build workflows warns that workflows run as the organization", async ({
  page,
}) => {
  await openRoles(page);
  await page.getByLabel("Nia New can build workflows").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Workflows run as the organization");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Nia New can build workflows")).not.toBeChecked();
});
