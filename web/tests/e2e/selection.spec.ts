import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { readPng } from "./helpers";

async function openTestImage(page: Page, name: string) {
  await page
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
  await expect(page.getByRole("contentinfo")).toContainText("512 x 512 px");
}

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

async function chooseFilter(page: Page, query: string, name: string) {
  await page.getByRole("searchbox", { name: "Search filters" }).fill(query);
  await page
    .getByRole("region", { name: "Filters" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .first()
    .click();
}

async function menu(page: Page, top: string, ...items: (string | RegExp)[]) {
  await page.getByRole("menuitem", { name: top, exact: true }).click();
  for (const item of items) await page.getByRole("menuitem", { name: item }).first().click();
}

const announcer = (page: Page) => page.getByTestId("announcer");
const canvas = (page: Page) => page.locator('canvas[tabindex="0"]');

/** Drag a rectangle with the Rectangular marquee, from and to points relative to the canvas center. */
async function marquee(page: Page, from: [number, number], to: [number, number]) {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error("no canvas");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await canvas(page).focus();
  await page.keyboard.press("m");
  await page.mouse.move(cx + from[0], cy + from[1]);
  await page.mouse.down();
  await page.mouse.move(cx + to[0], cy + to[1], { steps: 5 });
  await page.mouse.up();
}

/** The selection rectangle, read from the status bar. */
async function selectionRect(page: Page) {
  const text = (await page.getByRole("contentinfo").textContent()) ?? "";
  const match = /Selection: (\d+) x (\d+) px at x (\d+), y (\d+)/.exec(text);
  if (!match) throw new Error(`No selection in the status bar: ${text}`);
  const [, width, height, x, y] = match.map(Number) as [number, number, number, number, number];
  return { x, y, width, height };
}

async function exportPng(page: Page) {
  await canvas(page).focus();
  await page.keyboard.press("Control+s");
  const dialog = page.getByRole("dialog", { name: "Export image" });
  await dialog.getByRole("radio", { name: "PNG" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Export PNG" }).click(),
  ]);
  await expect(dialog).toBeHidden();
  return readPng(await readFile(await download.path()));
}

/** Count the pixels inside and outside a rectangle that differ between two exports. */
function differences(
  a: ReturnType<typeof readPng>,
  b: ReturnType<typeof readPng>,
  rect: { x: number; y: number; width: number; height: number },
) {
  expect([b.width, b.height, b.channels]).toEqual([a.width, a.height, a.channels]);
  let inside = 0;
  let outside = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const o = (y * a.width + x) * a.channels;
      let same = true;
      for (let c = 0; c < a.channels; c++) if (a.pixels[o + c] !== b.pixels[o + c]) same = false;
      if (same) continue;
      const within =
        x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
      if (within) inside++;
      else outside++;
    }
  }
  return { inside, outside };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("a filter changes only the selected pixels, and Outside only the others", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openTestImage(page, "Noise patches");
  const before = await exportPng(page);
  // The lower left quarter of the test image is noise, so a blur changes nearly every pixel.
  await marquee(page, [-220, 20], [-20, 220]);
  const rect = await selectionRect(page);
  expect(rect.width).toBeGreaterThan(150);

  await chooseFilter(page, "gaussian", "Gaussian filter");
  await front(page, "Properties");
  await expect(page.getByRole("radio", { name: "Selection", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(announcer(page)).toContainText(
    "Applied Gaussian filter (sigma 1 px) inside the selection",
    { timeout: 15_000 },
  );
  const inside = differences(before, await exportPng(page), rect);
  expect(inside.outside).toBe(0);
  expect(inside.inside).toBeGreaterThan(rect.width * rect.height * 0.5);

  // Undo, then filter everything except the selection.
  await canvas(page).focus();
  await page.keyboard.press("Control+z");
  await front(page, "Properties");
  await page.getByRole("radio", { name: "Outside" }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(announcer(page)).toContainText("outside the selection", { timeout: 15_000 });
  const outside = differences(before, await exportPng(page), rect);
  expect(outside.inside).toBe(0);
  expect(outside.outside).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("Select menu commands and the status bar", async ({ page }) => {
  await openTestImage(page, "Siemens star");
  const status = page.getByRole("contentinfo");
  await expect(status).toContainText("No selection");
  await canvas(page).focus();
  await page.keyboard.press("Control+a");
  await expect(status).toContainText("Selection: the whole image, 262,144 px");
  await page.keyboard.press("Control+d");
  await expect(status).toContainText("No selection");
  await page.keyboard.press("Control+Shift+d");
  await expect(status).toContainText("Selection: the whole image");
  await marquee(page, [-100, -100], [0, 0]);
  await page.keyboard.press("Shift+F7");
  await expect(announcer(page)).toContainText("Inverse.");
  await menu(page, "Select", /^Modify/, /^Grow/);
  const grow = page.getByRole("dialog", { name: "Grow selection" });
  await expect(grow.getByRole("textbox", { name: "Grow by" })).toBeFocused();
  await page.keyboard.type("10");
  await page.keyboard.press("Enter");
  await expect(grow).toBeHidden();
  await expect(announcer(page)).toContainText("Grow 10 px.");
  await page.keyboard.press("Control+z");
  await expect(announcer(page)).toContainText("Undid Grow 10 px");
});

test("Color Range, saved masks and the Masks panel", async ({ page }) => {
  await openTestImage(page, "Hue sweep");
  await menu(page, "Select", /^Color Range/);
  const dialog = page.getByRole("dialog", { name: "Color Range" });
  await expect(dialog.getByRole("button", { name: "OK" })).toBeDisabled();
  await dialog.getByRole("img", { name: /^Preview/ }).click({ position: { x: 20, y: 20 } });
  await expect(dialog.getByText(/Selects about \d+% of the image/)).toBeVisible();
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(announcer(page)).toContainText("Color Range. Selection:");

  await menu(page, "Select", /^Save selection/);
  await page.getByRole("textbox", { name: "Name" }).fill("Reds");
  await page.keyboard.press("Enter");
  await front(page, "Masks");
  const saved = page.getByRole("list", { name: "Saved masks" });
  await expect(saved).toContainText("Reds");
  await canvas(page).focus();
  await page.keyboard.press("Control+d");
  await expect(page.getByRole("contentinfo")).toContainText("No selection");
  await saved.getByRole("button", { name: 'Load "Reds" as the selection' }).click();
  await expect(announcer(page)).toContainText('Load "Reds".');
  await saved.getByRole("button", { name: 'Delete "Reds"' }).click();
  await expect(page.getByText("None yet.")).toBeVisible();
});

test("the selection dialogs and the Masks panel have no serious accessibility issues", async ({
  page,
}) => {
  await openTestImage(page, "Hue sweep");
  await canvas(page).focus();
  await page.keyboard.press("Control+a");
  const check = async (where: string) => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      serious.map(
        (v) => `${where}: ${v.id} (${v.nodes.length}) ${v.help} ${v.nodes[0]?.target.join(" ")}`,
      ),
    ).toEqual([]);
  };
  await front(page, "Masks");
  await check("Masks panel");
  for (const item of [/^Color Range/, /^Select by brightness/, /^Select by hue/]) {
    await menu(page, "Select", item);
    await expect(page.getByRole("dialog")).toBeVisible();
    await check(String(item));
    await page.keyboard.press("Escape");
  }
  await menu(page, "Select", /^Modify/, /^Feather/);
  await check("Feather");
  await page.keyboard.press("Escape");
  await canvas(page).focus();
  await page.keyboard.press("m");
  await check("Options bar");
});

/** Zoom from the status bar, as a factor. */
async function zoomOf(page: Page): Promise<number> {
  const text = (await page.getByRole("contentinfo").textContent()) ?? "";
  const match = /Zoom ([\d.]+)%/.exec(text);
  if (!match) throw new Error(`No zoom in the status bar: ${text}`);
  return Number(match[1]) / 100;
}

/**
 * The screen point of an image point, for a 512 x 512 image that is centered in the canvas, as
 * it is after any zoom command.
 */
async function screenOf(page: Page, x: number, y: number) {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error("no canvas");
  const zoom = await zoomOf(page);
  return {
    x: box.x + box.width / 2 + (x - 256) * zoom,
    y: box.y + box.height / 2 + (y - 256) * zoom,
  };
}

test("screen and image coordinates agree at many zoom levels", async ({ page }) => {
  await openTestImage(page, "Siemens star");
  const status = page.getByRole("contentinfo");
  const zooms: number[] = [];
  for (const keys of [
    ["Control+0"],
    ["Control+1"],
    ["Control+1", "Control+="],
    ["Control+1", "Control+=", "Control+="],
    ["Control+1", "Control+=", "Control+=", "Control+="],
    ["Control+1", "Control+-"],
    ["Control+1", "Control+-", "Control+-"],
  ]) {
    await canvas(page).focus();
    for (const key of keys) await page.keyboard.press(key);
    zooms.push(await zoomOf(page));
    // The pointer readout names the pixel under a computed point.
    const center = await screenOf(page, 240.5, 250.5);
    await page.mouse.move(center.x, center.y);
    await expect(status).toContainText("x 240, y 250");
    // A marquee between two computed corners selects exactly that rectangle.
    await page.keyboard.press("m");
    const a = await screenOf(page, 236, 246);
    const b = await screenOf(page, 276, 270);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
    await expect(status).toContainText("Selection: 40 x 24 px at x 236, y 246");
    await page.keyboard.press("Control+d");
  }
  // The zoom really changed: at least five different levels.
  expect(new Set(zooms).size).toBeGreaterThanOrEqual(5);
});

test("Quick Selection grows over a disk from one short stroke", async ({ page }) => {
  await openTestImage(page, "Disks and dots");
  await canvas(page).focus();
  await page.keyboard.press("Shift+W");
  await expect(page.getByText("Preparing the image for Quick Selection...")).toBeHidden({
    timeout: 15_000,
  });
  // The big disk at the lower left has its center at (128, 320) and a radius of 72.
  const from = await screenOf(page, 118, 315);
  const to = await screenOf(page, 138, 325);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  await expect(announcer(page)).toContainText(
    "Quick Selection. Selection: 144 x 144 px at x 56, y 248",
  );
});
