import { expect, test } from "@playwright/test";

test("the studio shell loads without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(page).toHaveTitle("PixelNexus");
  // The logo text was changed to "Pixel Nexus" by hand. Accept both spellings.
  await expect(page.getByRole("heading", { level: 1, name: /Pixel ?Nexus/ })).toBeVisible();
  await expect(page.getByRole("menubar", { name: "Main menu" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open an image to start" })).toBeVisible();
  await expect(
    page.getByText("Images are processed locally in your browser.").first(),
  ).toBeVisible();
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
