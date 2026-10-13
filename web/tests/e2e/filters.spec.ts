import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Bring a panel to the front: click its tab when it shows, otherwise use the Window menu. */
async function front(page: Page, name: string) {
  const tab = page.locator(".dv-tab:visible", { hasText: name });
  if ((await tab.count()) > 0) {
    await tab.first().click();
    return;
  }
  await page.getByRole("menuitem", { name: "Window" }).click();
  await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
}

async function openTestImage(page: Page, name: string) {
  await page
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
  await expect(page.getByRole("contentinfo")).toContainText("512 x 512 px");
}

async function chooseFilter(page: Page, query: string, name: string) {
  const search = page.getByRole("searchbox", { name: "Search filters" });
  await search.fill(query);
  await page
    .getByRole("region", { name: "Filters" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .first()
    .click();
}

const announcer = (page: Page) => page.getByTestId("announcer");

/** Wait for an Apply to finish. Allow extra time, because a busy test machine runs it slower. */
const applied = (page: Page, text: string) =>
  expect(announcer(page)).toContainText(`Applied ${text}`, { timeout: 15_000 });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("previews and applies a filter from the Library, and undo restores the image", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openTestImage(page, "Noise patches");
  await chooseFilter(page, "median", "Median filter");
  await front(page, "Properties");
  await expect(page.getByText("Exact preview at full resolution.")).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await applied(page, "Median filter (window size 3 px)");
  const history = page.getByRole("list", { name: "History steps" });
  await expect(history).toContainText("Median filter (window size 3 px)");
  await expect(page.getByText("Step 1 of 1")).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(page.getByText("Step 0 of 1")).toBeVisible();
  await expect(announcer(page)).toContainText("Undid Median filter");
  expect(errors).toEqual([]);
});

test("the Inspector shows the kernel that runs, and follows the parameters", async ({ page }) => {
  await openTestImage(page, "Siemens star");
  await chooseFilter(page, "laplacian", "Laplacian");
  await front(page, "Inspector");
  await page.getByRole("tab", { name: "Operator" }).click();
  const kernel = page.getByRole("table", { name: "L" });
  await expect(kernel).toContainText("-4");
  await front(page, "Properties");
  await page.getByRole("combobox", { name: "Neighbors" }).click();
  await page.getByRole("option", { name: "8 neighbors" }).click();
  await front(page, "Inspector");
  await page.getByRole("tab", { name: "Operator" }).click();
  await expect(page.getByRole("table", { name: "L" })).toContainText("-8");
  await page.getByRole("tab", { name: "Formula" }).click();
  await expect(page.getByText("The formula shows the current parameter values.")).toBeVisible();
});

test("planned filters are listed but cannot run", async ({ page }) => {
  await openTestImage(page, "Siemens star");
  await chooseFilter(page, "dncnn", "DnCNN");
  await front(page, "Properties");
  await expect(page.getByText(/This filter is planned for Phase/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
});

test("the Learn panel runs its demos on the image", async ({ page }) => {
  await openTestImage(page, "Noise patches");
  await chooseFilter(page, "median", "Median filter");
  await front(page, "Learn");
  await expect(page.getByRole("heading", { name: "Rank stepper" })).toBeVisible();
  const sorted = page.getByRole("list", { name: "Sorted window values" });
  await expect(sorted.getByRole("listitem")).toHaveCount(9);
  await page.getByRole("button", { name: "One pixel to the right" }).first().click();
  await expect(page.getByText("x 257, y 256").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Noise lab" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Noise lab metrics" })).toContainText("dB");
  await page.getByRole("radio", { name: "Academic" }).click();
  await expect(page.getByRole("button", { name: /Inspector/ })).toBeVisible();
});

test("the export name describes the last filter", async ({ page }) => {
  await openTestImage(page, "Siemens star");
  await chooseFilter(page, "gaussian", "Gaussian filter");
  await front(page, "Properties");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await applied(page, "Gaussian filter");
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("textbox", { name: "File name without extension" })).toHaveValue(
    "Siemens-star_gaussian_sigma-1",
  );
});

test("filters run from the Filter menu and the command palette", async ({ page }) => {
  await openTestImage(page, "Siemens star");
  await page.getByRole("menuitem", { name: "Filter" }).click();
  await page.getByRole("menuitem", { name: "Edge detection and boundary analysis" }).click();
  await page.getByRole("menuitem", { name: "Sobel" }).click();
  await front(page, "Properties");
  await expect(page.getByRole("heading", { name: "Sobel", exact: true })).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search commands" }).fill("motion blur");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Motion blur", exact: true })).toBeVisible();
  await page.keyboard.press("Control+Enter");
  await applied(page, "Motion blur");
});

test("the filter panels have no serious accessibility issues", async ({ page }) => {
  await openTestImage(page, "Disks and dots");
  await chooseFilter(page, "sobel", "Sobel");
  for (const panel of ["Properties", "Inspector", "Learn", "Developer", "History"]) {
    await front(page, panel);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      serious.map(
        (v) => `${panel}: ${v.id} (${v.nodes.length}) ${v.help} ${v.nodes[0]?.target.join(" ")}`,
      ),
    ).toEqual([]);
  }
});

test("window filters show their ranks in the Inspector and the Rank stepper", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openTestImage(page, "Noise patches");
  await chooseFilter(page, "trimmed", "Alpha-trimmed mean filter");
  await front(page, "Inspector");
  await page.getByRole("tab", { name: "Operator" }).click();
  await expect(
    page.getByText("the values at positions 3 to 7 of 9 make the output."),
  ).toBeVisible();
  await front(page, "Learn");
  const sorted = page.getByRole("list", { name: "Sorted window values" });
  await expect(sorted.locator("li[aria-current='true']")).toHaveCount(5);
  await expect(page.getByText(/from the marked values at positions 3 to 7/)).toBeVisible();

  await chooseFilter(page, "contraharmonic", "Contraharmonic mean filter");
  await front(page, "Inspector");
  await page.getByRole("tab", { name: "Operator" }).click();
  await expect(page.getByText(/so dark specks \(pepper\) are removed/)).toBeVisible();
  await front(page, "Properties");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await applied(page, "Contraharmonic mean filter");
  expect(errors).toEqual([]);
});

test("the Weight viewer shows the bilateral weights at the probe pixel", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openTestImage(page, "Disks");
  await chooseFilter(page, "bilateral", "Bilateral filter");
  await front(page, "Learn");
  await expect(page.getByRole("heading", { name: "Weight viewer" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Product, normalized/ })).toBeVisible();
  await expect(page.getByText(/of the total weight/)).toBeVisible();
  expect(errors).toEqual([]);
});
