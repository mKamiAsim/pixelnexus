// Viewport benchmark: open a 6000x6000 PNG and pan it, then print the timings as JSON.
//
// Start the studio first (pnpm dev), then run: pnpm --filter @pixelnexus/web bench:viewport
// Options: --url <address> (default http://localhost:5173/), --software (no GPU).
// The docs quote only numbers that this script printed. See docs/architecture/preview-and-rendering.md.
import { chromium } from "@playwright/test";

const argv = process.argv.slice(2);
const url = argv.includes("--url") ? argv[argv.indexOf("--url") + 1] : "http://localhost:5173/";
const software = argv.includes("--software");

const browser = await chromium.launch({
  args: software ? [] : ["--use-angle=default", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();

const renderer = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown";
});

// Draw a 6000x6000 test pattern in the page, save it as PNG, and open it through the file input.
const open = await page.evaluate(async () => {
  const size = 6000;
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#1040a0");
  gradient.addColorStop(0.5, "#f0c040");
  gradient.addColorStop(1, "#a01060");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  context.strokeStyle = "#ffffff";
  context.beginPath();
  for (let i = 0; i < size; i += 64) {
    context.moveTo(i + 0.5, 0);
    context.lineTo(i + 0.5, size);
    context.moveTo(0, i + 0.5);
    context.lineTo(size, i + 0.5);
  }
  context.stroke();
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const input = document.querySelector('[data-testid="file-input"]');
  const transfer = new DataTransfer();
  transfer.items.add(new File([blob], "large.png", { type: "image/png" }));
  input.files = transfer.files;
  const start = performance.now();
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((resolve) => {
    const check = () =>
      document.querySelector("footer")?.textContent?.includes("6000 x 6000")
        ? resolve()
        : setTimeout(check, 20);
    check();
  });
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return { fileMB: +(blob.size / 1048576).toFixed(1), ms: Math.round(performance.now() - start) };
});

/** Pan with one wheel event per animation frame and summarize the frame intervals. */
async function pan() {
  return page.evaluate(async () => {
    const canvas = document.querySelector('canvas[tabindex="0"]');
    const rect = canvas.getBoundingClientRect();
    const frames = [];
    let last = performance.now();
    for (let i = 0; i < 120; i++) {
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaX: i % 60 < 30 ? 25 : -25,
          deltaY: i % 40 < 20 ? 15 : -15,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          bubbles: true,
          cancelable: true,
        }),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = performance.now();
      frames.push(now - last);
      last = now;
    }
    frames.sort((a, b) => a - b);
    const at = (q) => +frames[Math.floor(q * (frames.length - 1))].toFixed(1);
    return { medianMs: at(0.5), p95Ms: at(0.95), maxMs: at(1) };
  });
}

const panFit = await pan();
await page.locator('canvas[tabindex="0"]').focus();
await page.keyboard.press("Control+1");
await page.waitForTimeout(300);
const pan100 = await pan();

console.log(
  JSON.stringify(
    {
      date: new Date().toISOString().slice(0, 10),
      renderer,
      browser: `Chromium ${browser.version()} (headless)`,
      open,
      panAtFit: panFit,
      panAt100: pan100,
      errors,
    },
    null,
    2,
  ),
);
await browser.close();
