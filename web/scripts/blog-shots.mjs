// Screenshots of the studio for blog/medium-post.md. Run the studio first (pnpm dev), then:
//   node scripts/blog-shots.mjs [studio URL]
// The images go to blog/images/. Each shot starts from a fresh browser context.
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:5173/";
const OUT = fileURLToPath(new URL("../../blog/images/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function fresh() {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    colorScheme: "dark",
  });
  // Keep the local engine out of the pictures, so they look the same on any computer.
  await context.route(/:8765\//, (route) => route.abort());
  const page = await context.newPage();
  await page.goto(BASE);
  return page;
}

async function workspace(page, name) {
  await page.getByRole("combobox", { name: "Workspace" }).click();
  await page.getByRole("option", { name: `Workspace: ${name}` }).click();
}

async function front(page, name) {
  // A checked item would close its panel, so a visible panel tab is clicked instead.
  const tab = page.getByRole("tab", { name, exact: true });
  if (await tab.count()) {
    await tab.first().click();
    return;
  }
  await page.getByRole("menuitem", { name: "Window" }).click();
  await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
}

async function openTestImage(page, name) {
  await page
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
  await page.getByRole("contentinfo").getByText("512 x 512 px").waitFor();
}

async function chooseFilter(page, query, name) {
  await page.getByRole("searchbox", { name: "Search filters" }).fill(query);
  await page
    .getByRole("region", { name: "Filters" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .first()
    .click();
}

async function apply(page, text) {
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByTestId("announcer").getByText(`Applied ${text}`).waitFor({ timeout: 30_000 });
}

async function shot(page, name) {
  // Messages would cover the panels, so they are dismissed first.
  const dismiss = page.getByRole("button", { name: "Dismiss message" });
  while (await dismiss.count()) await dismiss.first().click();
  const fit = page.getByRole("button", { name: "Fit screen" });
  if (await fit.isEnabled()) await fit.click();
  await page.mouse.move(0, 500);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log(`Wrote ${name}.png`);
}

// 1. The start screen with the test images.
{
  const page = await fresh();
  await shot(page, "start-screen");
  await page.context().close();
}

// 2. Study workspace: Sobel on the Siemens star, with the Learn panel.
{
  const page = await fresh();
  await workspace(page, "Study");
  await openTestImage(page, "Siemens star");
  await front(page, "Library");
  await chooseFilter(page, "sobel", "Sobel");
  await front(page, "Properties");
  await apply(page, "Sobel");
  await front(page, "Learn");
  await shot(page, "study-learn-sobel");
  await front(page, "Inspector");
  await page.getByRole("tab", { name: "Operator" }).click();
  await shot(page, "inspector-operator-sobel");
  await page.getByRole("tab", { name: "Formula" }).click();
  await shot(page, "inspector-formula-sobel");
  await page.context().close();
}

// 3. Developer workspace with the same filter.
{
  const page = await fresh();
  await workspace(page, "Developer");
  await openTestImage(page, "Step edge");
  await front(page, "Library");
  await chooseFilter(page, "sobel", "Sobel");
  await front(page, "Properties");
  await apply(page, "Sobel");
  await front(page, "Developer");
  await shot(page, "developer-sobel");
  await page.context().close();
}

// 4. Sharpening: Unsharp mask on the step edge, with the Inspector kernel.
{
  const page = await fresh();
  await workspace(page, "Study");
  await openTestImage(page, "Step edge");
  await front(page, "Library");
  await chooseFilter(page, "unsharp", "Unsharp mask");
  await front(page, "Properties");
  await apply(page, "Unsharp mask");
  await front(page, "Inspector");
  await page.getByRole("tab", { name: "Operator" }).click();
  await shot(page, "inspector-unsharp-mask");
  await page.context().close();
}

// 5. The Library with the filter families.
{
  const page = await fresh();
  await openTestImage(page, "Noise patches");
  await front(page, "Library");
  await shot(page, "library");
  await page.context().close();
}

await browser.close();
