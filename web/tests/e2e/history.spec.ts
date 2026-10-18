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

async function apply(page: Page, query: string, name: string, label: string) {
  await page.getByRole("searchbox", { name: "Search filters" }).fill(query);
  await page
    .getByRole("region", { name: "Filters" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .first()
    .click();
  await front(page, "Properties");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByTestId("announcer")).toContainText(`Applied ${label}`, {
    timeout: 15_000,
  });
}

test("shows step details, deletes a step with recompute, and frees memory", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Noise patches/ })
    .first()
    .click();
  await expect(page.getByRole("contentinfo")).toContainText("512 x 512 px");
  await apply(page, "median", "Median filter", "Median filter (window size 3 px)");
  await apply(page, "box", "Box filter", "Box filter");

  await front(page, "History");
  const history = page.getByRole("list", { name: "History steps" });
  await expect(history.getByRole("listitem")).toHaveCount(3);
  await expect(page.getByText(/Memory \d+ of 768 MB, 2 of 50 steps/)).toBeVisible();

  await page.getByRole("button", { name: "Details of step 1" }).click();
  await expect(history).toContainText("Window size");
  await expect(history).toContainText("Whole image");

  await page.getByRole("button", { name: "Delete step 1" }).click();
  await expect(page.getByTestId("announcer")).toContainText(
    "Deleted step 1, Median filter (window size 3 px), and recomputed 1 later step.",
    { timeout: 15_000 },
  );
  await expect(history.getByRole("listitem")).toHaveCount(2);
  await expect(history).not.toContainText("Median filter");

  await apply(page, "median", "Median filter", "Median filter (window size 3 px)");
  await front(page, "History");
  await page.getByRole("button", { name: "Free memory" }).click();
  await expect(history.getByRole("listitem")).toHaveCount(3);
  await expect(history).toContainText("1 older step was dropped to save memory.");
  await expect(history).not.toContainText("Box filter");
});
