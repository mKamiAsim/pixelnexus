import { expect, test, type Page } from "@playwright/test";

async function front(page: Page, name: string) {
  const tab = page.locator(".dv-tab:visible", { hasText: name });
  if ((await tab.count()) > 0) {
    await tab.first().click();
    return;
  }
  await page.getByRole("menuitem", { name: "Window" }).click();
  await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
}

async function apply(page: Page, query: string, name: string) {
  await page.getByRole("searchbox", { name: "Search filters" }).fill(query);
  await page
    .getByRole("region", { name: "Filters" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .first()
    .click();
  await front(page, "Properties");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByTestId("announcer")).toContainText(`Applied ${name}`, {
    timeout: 15_000,
  });
}

test("measures every step against the original and an earlier step", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Siemens star/ })
    .first()
    .click();
  await expect(page.getByRole("contentinfo")).toContainText("512 x 512 px");
  await apply(page, "noise-gaussian", "Add Gaussian noise");
  await apply(page, "median", "Median filter");

  await front(page, "Metrics");
  const metrics = page.getByRole("table", { name: "Quality metrics" });
  await expect(metrics).toContainText("dB");

  await page.getByRole("button", { name: "Measure every step" }).click();
  const steps = page.getByRole("table", { name: "Metrics of every step" });
  await expect(steps.getByRole("row")).toHaveCount(4);
  await expect(steps.getByRole("row").nth(1)).toContainText("Equal images");

  // The noisy step as the reference.
  await page.getByRole("combobox", { name: "Reference" }).click();
  await page.getByRole("option", { name: /^Step 1: Add Gaussian noise/ }).click();
  await expect(page.getByRole("button", { name: "Measure every step" })).toBeVisible();
  await page.getByRole("button", { name: "Measure every step" }).click();
  await expect(steps.getByRole("row").nth(2)).toContainText("Equal images");
});
