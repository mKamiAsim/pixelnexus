import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { MAGIC, makePng, pattern } from "./helpers";

/** A test file from tests/fixtures/formats, ready for setInputFiles. */
const fixture = (name: string, mimeType: string) => ({
  name,
  mimeType,
  buffer: readFileSync(fileURLToPath(new URL(`../fixtures/formats/${name}`, import.meta.url))),
});

/** Collect console errors and page errors, so a test can assert there were none. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

const statusBar = (page: Page) => page.getByRole("contentinfo");
const docTab = (page: Page, name: string) =>
  page
    .getByRole("list", { name: "Document tabs" })
    .getByRole("button", { name: new RegExp(`^${name.replace(".", "\\.")}`) });
const canvas = (page: Page) => page.locator('canvas[tabindex="0"]');

/** The image pixel under a screen point, read from the status bar. */
async function pixelUnder(page: Page, x: number, y: number): Promise<[number, number]> {
  await page.mouse.move(x, y);
  const text = await statusBar(page).textContent();
  const match = /x (\d+), y (\d+)/.exec(text ?? "");
  if (!match) throw new Error(`No pixel readout in the status bar: ${text}`);
  return [Number(match[1]), Number(match[2])];
}

// Each test gets a new browser context, so saved layouts and settings start empty.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

/** The 6000x6000 test file. Made once per worker, because it takes a second to build. */
let largePng: Buffer | null = null;
const large = () => (largePng ??= makePng(6000, 6000, pattern(6000, 6000)));

test("opens three images, zooms, pans, compares and exports in every format", async ({ page }) => {
  const errors = watchErrors(page);
  await page
    .getByTestId("file-input")
    .setInputFiles([
      { name: "pattern.png", mimeType: "image/png", buffer: makePng(640, 480, pattern(640, 480)) },
      fixture("jpeg-rgb.jpg", "image/jpeg"),
      fixture("webp-lossless-alpha.webp", "image/webp"),
    ]);
  const tabs = page
    .getByRole("list", { name: "Document tabs" })
    .getByRole("button", { name: /^(?!Close)/ });
  await expect(tabs).toHaveCount(3);
  await tabs.filter({ hasText: "pattern.png" }).click();
  await expect(statusBar(page)).toContainText("640 x 480 px");

  // Zoom with the keyboard. Start from 100%, because the fitted zoom depends on the panel layout.
  await canvas(page).focus();
  await page.keyboard.press("Control+1");
  await expect(statusBar(page)).toContainText("Zoom 100%");
  await page.keyboard.press("Control+Equal");
  await page.keyboard.press("Control+Equal");
  await expect(statusBar(page)).toContainText("Zoom 300%");

  // Pan with the Hand tool. The same screen point now shows a different pixel.
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error("The canvas has no size.");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const before = await pixelUnder(page, cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 90, cy + 60, { steps: 6 });
  await page.mouse.up();
  const after = await pixelUnder(page, cx, cy);
  expect(after[0]).toBe(before[0] - 30);
  expect(after[1]).toBe(before[1] - 20);

  // Every compare mode can be chosen, and the split view labels both halves.
  for (const mode of ["Split view", "Side by side", "Overlay", "Difference", "No comparison"]) {
    const radio = page.getByRole("radio", { name: mode });
    await radio.click();
    await expect(radio).toHaveAttribute("aria-checked", "true");
    if (mode === "Split view")
      await expect(page.getByText("Original", { exact: true })).toBeVisible();
  }

  // Export in each format. Check the file name and the first bytes of the file.
  for (const [label, extension] of [
    ["PNG", "png"],
    ["JPEG", "jpg"],
    ["WebP", "webp"],
    ["TIFF", "tif"],
  ] as const) {
    await page.keyboard.press("Control+s");
    const dialog = page.getByRole("dialog", { name: "Export image" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("radio", { name: label }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: `Export ${label}` }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`pattern.${extension}`);
    const bytes = await readFile(await download.path());
    const magic = MAGIC[extension] ?? [];
    if (extension === "tif") {
      expect([
        [0x49, 0x49, 0x2a, 0x00],
        [0x4d, 0x4d, 0x00, 0x2a],
      ]).toContainEqual([...bytes.subarray(0, 4)]);
    } else {
      expect([...bytes.subarray(0, magic.length)]).toEqual(magic);
    }
    await expect(dialog).toBeHidden();
  }
  await expect(page.getByText("Exported pattern.tif", { exact: true })).toBeVisible();

  // A resized export has the new size in its PNG header.
  await page.keyboard.press("Control+s");
  const dialog = page.getByRole("dialog", { name: "Export image" });
  await dialog.getByRole("radio", { name: "PNG" }).click();
  await dialog.getByRole("switch", { name: "Resize" }).click();
  const width = dialog.getByRole("textbox", { name: "Width in pixels" });
  await width.fill("320");
  await width.press("Enter");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Export PNG" }).click(),
  ]);
  const png = await readFile(await download.path());
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([320, 240]);

  expect(errors).toEqual([]);
});

test("rejects a file that is not an image, with a clear message", async ({ page }) => {
  await page.getByTestId("file-input").setInputFiles({
    name: "notes.png",
    mimeType: "image/png",
    buffer: Buffer.from("This is text, not an image."),
  });
  await expect(page.getByText("Could not open notes.png", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open an image to start" })).toBeVisible();
});

test("runs commands from the palette, and undo restores the image", async ({ page }) => {
  await page.getByRole("button", { name: /Gray ramp/ }).click();
  await expect(statusBar(page)).toContainText("512 x 512 px");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search commands" }).fill("rotate 90 clockwise");
  await page.keyboard.press("Enter");
  await expect(docTab(page, "Gray ramp.png")).toBeVisible();
  // Undone steps stay in the History list, so redo and jumping forward still work.
  const step = page
    .getByRole("list", { name: "History steps" })
    .getByRole("button", { name: /Rotate 90 clockwise/ });
  const spoken = page.getByTestId("announcer");
  await expect(step).toHaveAttribute("aria-current", "step");
  await expect(spoken).toHaveText("Rotate 90 clockwise applied. The image is 512 by 512 pixels.");
  await page.keyboard.press("Control+z");
  await expect(step).not.toHaveAttribute("aria-current", "step");
  await expect(page.getByText("Step 0 of 1")).toBeVisible();
  await expect(spoken).toHaveText("Undid Rotate 90 clockwise.");
});

test("opens a 6000 x 6000 image and pans it", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const started = Date.now();
  await page.getByTestId("file-input").setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: large(),
  });
  await expect(statusBar(page)).toContainText("6000 x 6000 px", { timeout: 60_000 });
  test.info().annotations.push({ type: "open time", description: `${Date.now() - started} ms` });

  await canvas(page).focus();
  await page.keyboard.press("Control+1");
  await expect(statusBar(page)).toContainText("Zoom 100%");
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error("The canvas has no size.");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const before = await pixelUnder(page, cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 200, cy - 100, { steps: 10 });
  await page.mouse.up();
  const after = await pixelUnder(page, cx, cy);
  expect(after).toEqual([before[0] + 200, before[1] + 100]);
  expect(errors).toEqual([]);
});

test("has no serious accessibility issues", async ({ page }) => {
  const check = async (state: string) => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      serious.map((v) => `${state}: ${v.id} (${v.nodes.length}) ${v.help}`),
      `axe found serious issues in the ${state} state`,
    ).toEqual([]);
  };
  await check("empty");
  await page.getByRole("button", { name: /Siemens star/ }).click();
  await expect(docTab(page, "Siemens star.png")).toBeVisible();
  await check("image open");
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("dialog", { name: "Export image" })).toBeVisible();
  await check("export dialog");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await check("command palette");
  await page.keyboard.press("Escape");
  for (const theme of ["Dark", "High contrast"]) {
    await page.getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("menuitem", { name: "Theme" }).click();
    await page.getByRole("menuitemcheckbox", { name: theme }).click();
    await check(`${theme} theme`);
  }
});
