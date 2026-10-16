import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function openProviders(page: Page) {
  await page.goto("/");
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await page.getByRole("menuitem", { name: "AI providers..." }).click();
  await expect(page.getByRole("dialog", { name: "AI providers" })).toBeVisible();
}

async function seriousIssues(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.help} ${v.nodes[0]?.target.join(" ")}`);
}

test("with no provider, every AI task uses its classical tool", async ({ page }) => {
  await openProviders(page);
  const dialog = page.getByRole("dialog", { name: "AI providers" });
  await expect(
    dialog.getByRole("combobox", { name: "Provider for Subject selection" }),
  ).toContainText("None. Use Subject selection (classical)");
  await expect(dialog.getByRole("combobox", { name: "Provider for Denoising" })).toContainText(
    "None. Use Non-local means",
  );
  await expect(dialog.getByText("No other providers yet. Add one below.")).toBeVisible();
});

test("an external provider needs HTTPS, and its key stays out of storage", async ({ page }) => {
  await openProviders(page);
  const dialog = page.getByRole("dialog", { name: "AI providers" });
  await dialog.getByLabel("Name", { exact: true }).fill("Test cloud");
  const url = dialog.getByRole("textbox", { name: "Base URL" });
  await url.fill("http://api.example.com");
  await expect(dialog.getByText("External hosts must use HTTPS.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add provider" })).toBeDisabled();
  await url.fill("https://api.example.com/v1");
  await dialog.getByLabel("API key").fill("test-key-0000");
  await dialog.getByRole("button", { name: "Add provider" }).click();
  await expect(dialog.getByText(/key \.\.\.0000 for this session/)).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).toContain("Test cloud");
  expect(stored).not.toContain("test-key-0000");
  await dialog.getByRole("combobox", { name: "Provider for Denoising" }).click();
  await page.getByRole("option", { name: "Test cloud" }).click();
  await expect(dialog.getByRole("combobox", { name: "Provider for Denoising" })).toContainText(
    "Test cloud",
  );
  expect(await seriousIssues(page)).toEqual([]);
  await dialog.getByRole("button", { name: "Remove Test cloud" }).click();
  await expect(dialog.getByRole("combobox", { name: "Provider for Denoising" })).toContainText(
    "None. Use Non-local means",
  );
});

test("a service preset fills the base URL and is offered only for its tasks", async ({ page }) => {
  await openProviders(page);
  const dialog = page.getByRole("dialog", { name: "AI providers" });
  await dialog.getByRole("combobox", { name: "Service preset" }).click();
  await page.getByRole("option", { name: "remove.bg" }).click();
  await expect(dialog.getByText("Base URL: https://api.remove.bg/v1.0")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Base URL" })).toHaveCount(0);
  await dialog.getByLabel("Name", { exact: true }).fill("Cutouts");
  await expect(dialog.getByRole("button", { name: "Add provider" })).toBeDisabled();
  await dialog.getByLabel("API key").fill("test-key-1111");
  await dialog.getByRole("button", { name: "Add provider" }).click();
  await dialog.getByRole("combobox", { name: "Provider for Denoising" }).click();
  await expect(page.getByRole("option", { name: "Cutouts" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await dialog.getByRole("combobox", { name: "Provider for Subject selection" }).click();
  await expect(page.getByRole("option", { name: "Cutouts" })).toBeVisible();
});

test("the request log starts empty and says it stays on the device", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("contentinfo").getByText("Images are processed locally in your browser."),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await page.getByRole("menuitem", { name: "AI request log..." }).click();
  const dialog = page.getByRole("dialog", { name: "AI request log" });
  await expect(dialog.getByText("No requests have left this device.")).toBeVisible();
});
