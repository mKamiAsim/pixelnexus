import { expect, test } from "@playwright/test";

test("the foundation screen loads without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(page).toHaveTitle("PixelNexus");
  await expect(page.getByRole("heading", { level: 1, name: "PixelNexus" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Catalog: 338 entries" })).toBeVisible();
  await expect(page.getByText("Images are processed locally in your browser.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the build works from a sub-path such as /studio/", async ({ page }) => {
  const response = await page.goto("/index.html");
  expect(response?.ok()).toBe(true);
  const scripts = await page
    .locator("script[type=module]")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src") ?? ""));
  expect(scripts.every((src) => src.startsWith("./"))).toBe(true);
});
