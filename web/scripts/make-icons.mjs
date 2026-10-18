/**
 * Draws the PNG app icons from public/icon.svg and public/icon-maskable.svg.
 * The PNG files are committed. Run again after you change an SVG icon:
 *   node scripts/make-icons.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "../public");
const ICONS = [
  ["icon.svg", "icon-192.png", 192],
  ["icon.svg", "icon-512.png", 512],
  ["icon.svg", "apple-touch-icon.png", 180],
  ["icon-maskable.svg", "icon-maskable-512.png", 512],
];

const browser = await chromium.launch();
for (const [source, target, size] of ICONS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const svg = readFileSync(join(PUBLIC, source), "utf8");
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: join(PUBLIC, target), omitBackground: true });
  await page.close();
}
await browser.close();
console.log(`Drew ${ICONS.length} icons in public/.`);
