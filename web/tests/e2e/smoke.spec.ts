import { expect, test } from "@playwright/test";

test("the studio shell loads without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    // The studio looks for the local engine, which is not running in these tests. The
    // browser logs that refused connection as a console error. Firefox names the address in
    // the text, not in the location.
    const fromEngine =
      message.location().url.includes(":8765/") || message.text().includes(":8765/");
    if (message.type() === "error" && !fromEngine) errors.push(message.text());
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
