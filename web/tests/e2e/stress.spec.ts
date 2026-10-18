/**
 * Large-image stress test: a 6000 x 6000 image through filters, the pipeline,
 * undo and a delete with recompute, with no errors. Times go to the test annotations.
 */
import { expect, test, type Page } from "@playwright/test";

import { makePng, pattern } from "./helpers";

async function front(page: Page, name: string) {
  const tab = page.locator(".dv-tab:visible", { hasText: name });
  if ((await tab.count()) > 0) {
    await tab.first().click();
    return;
  }
  await page.getByRole("menuitem", { name: "Window" }).click();
  await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
}

async function apply(page: Page, query: string, name: string) {
  await page.getByRole("searchbox", { name: "Search filters" }).fill(query);
  await page
    .getByRole("region", { name: "Filters" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .first()
    .click();
  await front(page, "Properties");
  const started = Date.now();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByTestId("announcer")).toContainText(`Applied ${name}`, {
    timeout: 120_000,
  });
  test
    .info()
    .annotations.push({ type: `${query} time`, description: `${Date.now() - started} ms` });
}

test("a 6000 x 6000 image goes through filters, a pipeline and a delete", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // The studio looks for the local engine, which is not running here. Its refused connection is
  // logged as a console error, and is not a failure.
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      !m.location().url.includes(":8765/") &&
      !m.text().includes(":8765/")
    )
      errors.push(m.text());
  });
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: makePng(6000, 6000, pattern(6000, 6000)),
  });
  await expect(page.getByRole("contentinfo")).toContainText("6000 x 6000 px", { timeout: 60_000 });

  await apply(page, "gaussian", "Gaussian filter");
  await apply(page, "median", "Median filter");
  await apply(page, "unsharp", "Unsharp mask");

  // Delete the median step: the unsharp mask is recomputed on the Gaussian result.
  await front(page, "History");
  await page.getByRole("button", { name: "Delete step 2" }).click();
  await expect(page.getByTestId("announcer")).toContainText("recomputed 1 later step", {
    timeout: 120_000,
  });
  const history = page.getByRole("list", { name: "History steps" });
  await expect(history).not.toContainText("Median filter");

  // The same chain as a pipeline, from the original.
  await front(page, "Pipeline");
  await page.getByRole("button", { name: "Make from the history" }).click();
  await front(page, "History");
  await page.getByRole("menuitem", { name: "Filter", exact: true }).click();
  await page.getByRole("menuitem", { name: "Run pipeline", exact: true }).click();
  await expect(history).toContainText("Pipeline (2 steps)", { timeout: 120_000 });

  await page.keyboard.press("Control+z");
  await expect(page.getByRole("contentinfo")).toContainText("6000 x 6000 px");
  expect(errors).toEqual([]);
});
