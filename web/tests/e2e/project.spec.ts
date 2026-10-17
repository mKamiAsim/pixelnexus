import { readFile } from "node:fs/promises";

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

async function menu(page: Page, top: string, item: string) {
  await page.getByRole("menuitem", { name: top, exact: true }).click();
  // A menu item's name ends with its shortcut, such as "Save project Ctrl+Shift+S".
  const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page
    .getByRole("menuitem", { name: new RegExp(`^${escaped}( |$)`) })
    .first()
    .click();
}

test("saves a project with history and pipeline, and opens it again", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Noise patches/ })
    .first()
    .click();
  await expect(page.getByRole("contentinfo")).toContainText("512 x 512 px");
  await page.getByRole("searchbox", { name: "Search filters" }).fill("median");
  await page
    .getByRole("region", { name: "Filters" })
    .getByRole("button", { name: /^Median filter/ })
    .first()
    .click();
  await front(page, "Properties");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByTestId("announcer")).toContainText("Applied Median filter", {
    timeout: 15_000,
  });
  await menu(page, "Filter", "Add to pipeline");

  const downloading = page.waitForEvent("download");
  await menu(page, "File", "Save project");
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.pnx$/);
  const bytes = await readFile(await download.path());
  // A ZIP archive with the project description first.
  expect(bytes.subarray(0, 4).toString("hex")).toBe("504b0304");

  await menu(page, "File", "Close");
  await page.getByRole("button", { name: "Clear the pipeline" }).click();
  await page.getByTestId("file-input").setInputFiles({
    name: "work.pnx",
    mimeType: "application/zip",
    buffer: bytes,
  });
  await expect(page.getByRole("contentinfo")).toContainText("512 x 512 px");
  await front(page, "History");
  const history = page.getByRole("list", { name: "History steps" });
  await expect(history).toContainText("Median filter (window size 3 px)");
  await front(page, "Pipeline");
  await expect(
    page.getByRole("list", { name: "Pipeline steps" }).getByRole("listitem"),
  ).toHaveCount(1);
});
