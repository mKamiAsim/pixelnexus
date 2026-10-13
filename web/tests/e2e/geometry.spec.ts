import { expect, test, type Page } from "@playwright/test";

async function openTestImage(page: Page, name: string) {
  await page
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
  await expect(page.getByRole("contentinfo")).toContainText("512 x 512 px");
}

const announcer = (page: Page) => page.getByTestId("announcer");
const status = (page: Page) => page.getByRole("contentinfo");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("Image > Resize keeps the proportions and undo restores the size", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openTestImage(page, "Zone plate");
  await page.locator('canvas[tabindex="0"]').focus();
  await page.keyboard.press("Control+Alt+i");
  const dialog = page.getByRole("dialog", { name: "Resize image" });
  const width = dialog.getByRole("textbox", { name: "Width" });
  await expect(width).toBeFocused();
  await width.fill("200");
  await width.press("Tab");
  await expect(dialog.getByRole("textbox", { name: "Height" })).toHaveValue("200");
  await dialog.getByRole("combobox", { name: "Method" }).click();
  await page.getByRole("option", { name: "Lanczos" }).click();
  await dialog.getByRole("button", { name: "Resize" }).click();
  await expect(announcer(page)).toContainText("Resize to 200 x 200 (Lanczos) applied");
  await expect(status(page)).toContainText("200 x 200 px");
  await page.keyboard.press("Control+z");
  await expect(status(page)).toContainText("512 x 512 px");
  expect(errors).toEqual([]);
});

test("Image > Rotate by angle grows the canvas, and the Library opens the dialog", async ({
  page,
}) => {
  await openTestImage(page, "Checkerboard");
  await page.getByRole("menuitem", { name: "Image", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rotate by angle..." }).click();
  const dialog = page.getByRole("dialog", { name: "Rotate by angle" });
  await dialog.getByRole("textbox", { name: "Angle" }).fill("45");
  await dialog.getByRole("textbox", { name: "Angle" }).press("Tab");
  await expect(dialog.getByText("The result is 725 x 725 pixels.")).toBeVisible();
  await dialog.getByRole("button", { name: "Rotate" }).click();
  await expect(announcer(page)).toContainText("Rotate 45 degrees (bicubic) applied");
  await expect(status(page)).toContainText("725 x 725 px");

  // The catalog entry runs the same command from the Library and Properties.
  await page.getByRole("searchbox", { name: "Search filters" }).fill("resize");
  await page
    .getByRole("region", { name: "Filters" })
    .getByRole("button", { name: /^Resize/ })
    .first()
    .click();
  await page.locator(".dv-tab:visible", { hasText: "Properties" }).first().click();
  await page.getByRole("button", { name: "Open Resize" }).click();
  await expect(page.getByRole("dialog", { name: "Resize image" })).toBeVisible();
});
