import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
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

async function chooseFilter(page: Page, query: string, name: string) {
  await page.getByRole("searchbox", { name: "Search filters" }).fill(query);
  await page
    .getByRole("region", { name: "Filters" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .first()
    .click();
}

async function addToPipeline(page: Page) {
  await page.getByRole("menuitem", { name: "Filter", exact: true }).click();
  await page.getByRole("menuitem", { name: "Add to pipeline", exact: true }).click();
}

test("builds, runs, edits, saves and loads a pipeline", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Noise patches/ })
    .first()
    .click();
  await expect(page.getByRole("contentinfo")).toContainText("512 x 512 px");
  await chooseFilter(page, "median", "Median filter");
  await addToPipeline(page);
  await chooseFilter(page, "gaussian", "Gaussian filter");
  await addToPipeline(page);

  const steps = page.getByRole("list", { name: "Pipeline steps" });
  await expect(steps.getByRole("listitem")).toHaveCount(2);
  await expect(steps).toContainText("Median filter (window size 3 px)");

  // Reorder with the keyboard-friendly buttons.
  await page.getByRole("button", { name: "Move step 2 up" }).click();
  await expect(steps.getByRole("listitem").first()).toContainText("Gaussian filter");

  await page.getByRole("button", { name: "Run on the original image" }).click();
  const history = page.getByRole("list", { name: "History steps" });
  await front(page, "History");
  await expect(history).toContainText("Pipeline (2 steps)", { timeout: 15_000 });

  // Turning a step off and running again recomputes from the cache.
  await front(page, "Pipeline");
  await page.getByRole("checkbox", { name: "Step 1 on" }).uncheck();
  await page.getByRole("button", { name: "Run on the original image" }).click();
  await expect(steps).toContainText("Off");
  await front(page, "History");
  await expect(history).toContainText("Pipeline (1 step)", { timeout: 15_000 });

  await front(page, "Pipeline");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    ),
  ).toEqual([]);

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save as JSON" }).click();
  const file = await (await downloading).path();
  const saved = JSON.parse(await readFile(file, "utf8")) as {
    format: string;
    steps: { filter: string; enabled: boolean }[];
  };
  expect(saved.format).toBe("pixelnexus-pipeline");
  expect(saved.steps.map((s) => [s.filter, s.enabled])).toEqual([
    ["gaussian", false],
    ["median", true],
  ]);

  await page.getByRole("button", { name: "Clear the pipeline" }).click();
  await expect(page.getByText(/No steps yet/)).toBeVisible();
  await page.getByLabel("Pipeline file").setInputFiles(file);
  await expect(steps.getByRole("listitem")).toHaveCount(2);
});
