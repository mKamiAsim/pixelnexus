import { expect, test } from "@playwright/test";

test("exports the presets of a filter and imports them back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Search filters" }).fill("gaussian");
  await page
    .getByRole("region", { name: "Filters" })
    .getByRole("button", { name: /^Gaussian filter/ })
    .first()
    .click();
  await page.getByRole("textbox", { name: "New preset name" }).fill("Soft");
  await page.getByRole("button", { name: "Save preset" }).click();

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export the presets of this filter" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("presets-gaussian.json");
  const file = await download.path();

  await page.getByRole("combobox", { name: "Load a preset" }).click();
  await page.getByRole("option", { name: "Soft" }).click();
  await page.getByRole("button", { name: "Delete this preset" }).click();
  await expect(page.getByText("None saved yet")).toBeVisible();

  const choosing = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import presets" }).click();
  await (await choosing).setFiles(file);
  await expect(page.getByRole("combobox", { name: "Load a preset" })).toBeVisible();
  await expect(page.getByText("Imported 1 preset").first()).toBeVisible();
});
