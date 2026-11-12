import { expect, test, type Page } from "@playwright/test";

// The low-code designer (S-28) on the dev preview's sample catalog (src/lib/workflow-fixture.ts).
// Nothing is saved: the preview has no database; the test run is answered by the preview.
async function openDesigner(page: Page) {
  await page.goto("/dev/hub?screen=designer");
  const first = page.getByRole("button", { name: "Add the first step here" });
  await expect(first).toBeVisible();
  // Interactive once a click opens the step menu.
  const menu = page.getByLabel("Add a step", { exact: true });
  await expect(async () => {
    if (!(await menu.isVisible())) await first.click({ timeout: 1000 });
    await expect(menu).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await menu.press("Escape");
  await page.getByLabel("What starts it").focus();
  // The cookie banner (shown once the page is interactive) sits over the bottom of the page.
  const reject = page.getByRole("button", { name: "Reject non-essential" });
  await reject.click({ timeout: 10_000 }).catch(() => {});
  await expect(reject).toBeHidden();
}

async function addStep(page: Page, slot: ReturnType<Page["getByRole"]>, type: string) {
  await slot.click();
  await page.getByLabel("Add a step", { exact: true }).selectOption(type);
}

const words = (page: Page) => page.getByRole("region", { name: "In plain words" });

test("a lookup's list feeds a 'for each', and each item's data goes into an email", async ({
  page,
}) => {
  await openDesigner(page);
  await page.getByLabel("Name", { exact: true }).fill("Renewal reminders");
  await page.getByLabel("What starts it").selectOption("charter.payment_received");
  await addStep(
    page,
    page.getByRole("button", { name: "Add the first step here" }),
    "charter.find_members",
  );
  await page.getByLabel("Standing").selectOption("current");
  await addStep(page, page.getByRole("button", { name: "Add a step here" }).last(), "foreach");
  await page.getByRole("button", { name: "Choose a list" }).click();
  const picker = page.getByRole("dialog", { name: "Data from earlier steps" });
  // Only lists are offered for "for each".
  await expect(picker.getByRole("button", { name: "How many" })).toHaveCount(0);
  await picker.getByRole("button", { name: "Members (list)" }).click();
  await addStep(
    page,
    page
      .getByRole("list", { name: /For each:/ })
      .getByRole("button", { name: "Add the first step here" }),
    "email",
  );
  const email = page.locator('[data-step="send_an_email"]');
  await email.getByLabel("An email address from the data").check();
  await email.getByRole("button", { name: "Insert data" }).first().click();
  await page
    .getByRole("dialog", { name: "Data from earlier steps" })
    .getByRole("button", { name: "Email", exact: true })
    .click();
  await email.getByLabel("Subject").fill("Time to renew, ");
  await email.getByRole("button", { name: "Insert data" }).nth(1).click();
  await page
    .getByRole("dialog", { name: "Data from earlier steps" })
    .getByRole("button", { name: "Name", exact: true })
    .click();
  await email.getByLabel("Message").fill("Your membership ends soon.");
  await expect(email.getByText("Each of Find members → Email")).toBeVisible();
  await expect(words(page)).toContainText("For each item in [Find members → Members]:");
  await expect(words(page)).toContainText('Email "Time to renew, [Each of Find members → Name]"');
  await expect(page.getByRole("button", { name: "Save workflow" })).toBeEnabled();
  // The test run says what each step would do.
  await page.getByRole("button", { name: "Test run" }).click();
  await expect(page.getByText("The test run succeeded.")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Test run" }).getByText("Would email 3 people"),
  ).toBeVisible();
});

test("steps can be dragged into a new order, and moved with the arrows", async ({ page }) => {
  await openDesigner(page);
  await page.getByLabel("Name", { exact: true }).fill("Order");
  await page.getByLabel("What starts it").selectOption("charter.payment_received");
  await addStep(page, page.getByRole("button", { name: "Add the first step here" }), "compose");
  await page.getByLabel("Step name (optional)").fill("First");
  await addStep(page, page.getByRole("button", { name: "Add a step here" }).last(), "compose");
  await page.getByLabel("Step name (optional)").fill("Second");
  await expect(words(page)).toContainText(/First[\s\S]*Second/);
  // Drag "Second" above "First".
  await page.getByRole("button", { name: "Drag Second" }).dragTo(page.locator('[data-slot=":0"]'));
  await expect(words(page)).toContainText(/Second[\s\S]*First/);
  await page.getByRole("button", { name: "Move Second down" }).click();
  await expect(words(page)).toContainText(/First[\s\S]*Second/);
});

test("conditions, variables and retries; problems are listed before saving", async ({ page }) => {
  await openDesigner(page);
  await page.getByLabel("What starts it").selectOption("charter.payment_received");
  await addStep(
    page,
    page.getByRole("button", { name: "Add the first step here" }),
    "increment_variable",
  );
  await expect(words(page)).toContainText("Give the workflow a name.");
  await expect(words(page)).toContainText("changes a variable before it's made");
  await expect(page.getByRole("button", { name: "Save workflow" })).toBeDisabled();
  await page.getByRole("button", { name: "Delete Add to a variable" }).click();
  await addStep(page, page.getByRole("button", { name: "Add the first step here" }), "condition");
  const cond = page.locator('[data-step="condition_if_otherwise"]');
  await cond.getByRole("button", { name: "Insert data" }).first().click();
  await page
    .getByRole("dialog", { name: "Data from earlier steps" })
    .getByRole("button", { name: "Amount" })
    .click();
  await cond.getByLabel("Comparison").selectOption("gt");
  await cond.getByLabel("Compared with").fill("100");
  await cond.getByText("Settings: retries and run after").click();
  await cond.getByLabel("Retry up to (times)").fill("3");
  await expect(words(page)).toContainText("If [Amount] gt 100:");
  await expect(words(page)).toContainText("(retries up to 3 times)");
  await expect(page.getByRole("list", { name: /If yes:/ })).toBeVisible();
  await expect(page.getByRole("list", { name: /If no:/ })).toBeVisible();
});
