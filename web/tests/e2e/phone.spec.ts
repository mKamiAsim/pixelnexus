import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

test("a phone gets the canvas on top and the panels below, and can apply a filter", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Siemens star/ })
    .first()
    .click();
  await expect(page.getByRole("contentinfo")).toContainText("512 x 512 px");

  const canvas = page.locator('canvas[tabindex="0"]');
  const properties = page.locator(".dv-tab:visible", { hasText: "Properties" }).first();
  const canvasBox = await canvas.boundingBox();
  const tabBox = await properties.boundingBox();
  if (!canvasBox || !tabBox) throw new Error("No layout boxes.");
  // The panels sit below the canvas, and the canvas spans most of the width.
  expect(tabBox.y).toBeGreaterThan(canvasBox.y + canvasBox.height - 2);
  expect(canvasBox.width).toBeGreaterThan(280);

  await page.locator(".dv-tab:visible", { hasText: "Library" }).first().click();
  await page.getByRole("searchbox", { name: "Search filters" }).fill("gaussian");
  await page
    .getByRole("region", { name: "Filters" })
    .getByRole("button", { name: /^Gaussian filter/ })
    .first()
    .click();
  await properties.click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByTestId("announcer")).toContainText("Applied Gaussian filter");

  const serious = (
    await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  ).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious).toEqual([]);
});
