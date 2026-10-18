// Filter benchmark: apply common browser filters to a large image through the studio, and print
// the times the studio measured, as JSON. It profiles before any speed work.
//
// Start the studio first (pnpm dev), then run: pnpm --filter @pixelnexus/web bench:filters
// Options: --url <address> (default http://localhost:5173/), --size <pixels> (default 4096),
// --only <ids> (comma-separated filter ids).
// The docs quote only numbers that this script printed.
import os from "node:os";

import { chromium } from "@playwright/test";

const argv = process.argv.slice(2);
const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const url = option("--url", "http://localhost:5173/");
const size = Number(option("--size", "4096"));

// Default values of each filter, as the catalog sets them.
const FILTERS = [
  ["box", "Box filter"],
  ["gaussian", "Gaussian filter"],
  ["weighted-average", "Weighted average filter"],
  ["unsharp-mask", "Unsharp mask"],
  ["sobel", "Sobel"],
  ["laplacian", "Laplacian"],
  ["median", "Median filter"],
  ["bilateral", "Bilateral filter"],
  ["opening", "Opening"],
  ["guided", "Guided filter"],
  ["kuwahara", "Kuwahara filter"],
  ["canny", "Canny"],
];

const browser = await chromium.launch({
  args: ["--use-angle=default", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(url);
// A noisy test image makes a large PNG, so this browser profile allows larger files.
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem(
    "pixelnexus.settings.v1",
    JSON.stringify({
      limits: { maxFileBytes: 500 * 1024 * 1024, maxPixels: 100e6, maxSide: 16384 },
    }),
  );
});
await page.reload();

// A photo-like test image: smooth gradients with fine random detail, so no filter has an easy case.
await page.evaluate(async (side) => {
  const canvas = new OffscreenCanvas(side, side);
  const context = canvas.getContext("2d");
  const pixels = context.createImageData(side, side);
  let seed = 12345;
  const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const o = (y * side + x) * 4;
      const n = random() * 40 - 20;
      pixels.data[o] = (x / side) * 200 + n + 20;
      pixels.data[o + 1] = (y / side) * 200 + n + 20;
      pixels.data[o + 2] = 128 + 60 * Math.sin(x / 50) * Math.cos(y / 70) + n;
      pixels.data[o + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const input = document.querySelector('[data-testid="file-input"]');
  const transfer = new DataTransfer();
  transfer.items.add(new File([blob], "bench.png", { type: "image/png" }));
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, size);
await page
  .getByRole("contentinfo")
  .filter({ hasText: `${size} x ${size} px` })
  .waitFor({ timeout: 120_000 });

const only = option("--only", "").split(",").filter(Boolean);
const results = [];
// The first apply also starts the workers. A warm-up apply keeps that out of the numbers.
const plan = [
  ["laplacian", "Laplacian", true],
  ...FILTERS.filter(([id]) => only.length === 0 || only.includes(id)),
];
for (const [query, name, warmUp] of plan) {
  await page.getByRole("searchbox", { name: "Search filters" }).fill(query);
  await page
    .getByRole("region", { name: "Filters" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .first()
    .click();
  const tab = page.locator(".dv-tab:visible", { hasText: "Properties" });
  if (await tab.count()) await tab.first().click();
  const clicked = Date.now();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const last = page.getByText(/^Last apply: \d+ ms/);
  await last.waitFor({ timeout: 600_000 });
  await page.getByTestId("announcer").filter({ hasText: "Applied" }).waitFor({ timeout: 600_000 });
  const wallMs = Date.now() - clicked;
  const text = (await last.textContent()) ?? "";
  const match = /(\d+) ms, (\d+) tiles? on (\d+) workers?/.exec(text);
  if (!warmUp)
    results.push({
      filter: query,
      ms: match ? Number(match[1]) : null,
      wallMs,
      tiles: match ? Number(match[2]) : null,
      workers: match ? Number(match[3]) : null,
    });
  await page.keyboard.press("Control+z");
}

const renderer = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown";
});
console.log(
  JSON.stringify(
    {
      date: new Date().toISOString().slice(0, 10),
      image: `${size} x ${size}`,
      cpu: os.cpus()[0]?.model ?? "unknown",
      cores: os.cpus().length,
      renderer,
      browser: `Chromium ${browser.version()} (headless)`,
      results,
      errors,
    },
    null,
    2,
  ),
);
await browser.close();
