import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("sweeps sigma in the compare grid and uses one cell", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Siemens star/ })
    .first()
    .click();
  await expect(page.getByRole("contentinfo")).toContainText("512 x 512 px");
  await page.getByRole("searchbox", { name: "Search filters" }).fill("gaussian");
  await page
    .getByRole("region", { name: "Filters" })
    .getByRole("button", { name: /^Gaussian filter/ })
    .first()
    .click();

  await page.getByRole("menuitem", { name: "Filter", exact: true }).click();
  await page.getByRole("menuitem", { name: "Compare grid...", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Compare grid" });
  await expect(dialog.getByRole("combobox", { name: "Value to sweep" })).toContainText("Sigma");
  await dialog.getByRole("button", { name: "Add sweep of Gaussian filter" }).click();
  const cells = dialog.getByRole("list", { name: "Compare cells" });
  await expect(cells.getByRole("listitem")).toHaveCount(5);
  await expect(cells).toContainText("Gaussian filter (sigma 5 px");

  await dialog.getByRole("button", { name: "Run", exact: true }).click();
  await expect(cells.getByRole("listitem")).toHaveCount(6, { timeout: 15_000 });
  await expect(cells.getByText(/^\d+ ms$/)).toHaveCount(5, { timeout: 30_000 });
  await expect(cells.getByRole("img", { name: /^Original at x 128, y 128/ })).toBeVisible();

  const serious = (
    await new AxeBuilder({ page }).include('[role="dialog"]').analyze()
  ).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious).toEqual([]);

  await cells.getByRole("listitem").nth(3).getByRole("button", { name: "Use" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("slider", { name: /^Sigma/ }).first()).toHaveAttribute(
    "aria-valuenow",
    "3",
  );
});
