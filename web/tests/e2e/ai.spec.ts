import AxeBuilder from "@axe-core/playwright";
import { deflateSync } from "node:zlib";

import { expect, test, type Page } from "@playwright/test";

/** A white, opaque PNG of the given size, for the mock service. */
function whitePng(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const b of bytes) c = (crcTable[(c ^ b) & 255] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 4 + 1) * height, 255);
  for (let y = 0; y < height; y++) rows[y * (width * 4 + 1)] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function openProviders(page: Page) {
  await page.goto("/");
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await page.getByRole("menuitem", { name: "AI providers..." }).click();
  await expect(page.getByRole("dialog", { name: "AI providers" })).toBeVisible();
}

async function seriousIssues(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.help} ${v.nodes[0]?.target.join(" ")}`);
}

test("with no provider, every AI task uses its classical tool", async ({ page }) => {
  await openProviders(page);
  const dialog = page.getByRole("dialog", { name: "AI providers" });
  await expect(
    dialog.getByRole("combobox", { name: "Provider for Subject selection" }),
  ).toContainText("None. Use Subject selection (classical)");
  await expect(dialog.getByRole("combobox", { name: "Provider for Denoising" })).toContainText(
    "None. Use Non-local means",
  );
  await expect(dialog.getByText("No other providers yet. Add one below.")).toBeVisible();
});

test("an external provider needs HTTPS, and its key stays out of storage", async ({ page }) => {
  await openProviders(page);
  const dialog = page.getByRole("dialog", { name: "AI providers" });
  await dialog.getByLabel("Name", { exact: true }).fill("Test cloud");
  const url = dialog.getByRole("textbox", { name: "Base URL" });
  await url.fill("http://api.example.com");
  await expect(dialog.getByText("External hosts must use HTTPS.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add provider" })).toBeDisabled();
  await url.fill("https://api.example.com/v1");
  await dialog.getByLabel("API key").fill("test-key-0000");
  await dialog.getByRole("button", { name: "Add provider" }).click();
  await expect(dialog.getByText(/key \.\.\.0000 for this session/)).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).toContain("Test cloud");
  expect(stored).not.toContain("test-key-0000");
  await dialog.getByRole("combobox", { name: "Provider for Denoising" }).click();
  await page.getByRole("option", { name: "Test cloud" }).click();
  await expect(dialog.getByRole("combobox", { name: "Provider for Denoising" })).toContainText(
    "Test cloud",
  );
  expect(await seriousIssues(page)).toEqual([]);
  await dialog.getByRole("button", { name: "Remove Test cloud" }).click();
  await expect(dialog.getByRole("combobox", { name: "Provider for Denoising" })).toContainText(
    "None. Use Non-local means",
  );
});

test("a service preset fills the base URL and is offered only for its tasks", async ({ page }) => {
  await openProviders(page);
  const dialog = page.getByRole("dialog", { name: "AI providers" });
  await dialog.getByRole("combobox", { name: "Service preset" }).click();
  await page.getByRole("option", { name: "remove.bg" }).click();
  await expect(dialog.getByText("Base URL: https://api.remove.bg/v1.0")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Base URL" })).toHaveCount(0);
  await dialog.getByLabel("Name", { exact: true }).fill("Cutouts");
  await expect(dialog.getByRole("button", { name: "Add provider" })).toBeDisabled();
  await dialog.getByLabel("API key").fill("test-key-1111");
  await dialog.getByRole("button", { name: "Add provider" }).click();
  await dialog.getByRole("combobox", { name: "Provider for Denoising" }).click();
  await expect(page.getByRole("option", { name: "Cutouts" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await dialog.getByRole("combobox", { name: "Provider for Subject selection" }).click();
  await expect(page.getByRole("option", { name: "Cutouts" })).toBeVisible();
});

test("the request log starts empty and says it stays on the device", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("contentinfo").getByText("Images are processed locally in your browser."),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await page.getByRole("menuitem", { name: "AI request log..." }).click();
  const dialog = page.getByRole("dialog", { name: "AI request log" });
  await expect(dialog.getByText("No requests have left this device.")).toBeVisible();
});

test("consent comes before every external request, and never for local work", async ({ page }) => {
  let requests = 0;
  // The mock service. Nothing leaves this computer.
  await page.route("https://ai.mock.test/v1/**", async (route) => {
    requests += 1;
    await route.fulfill({ contentType: "image/png", body: whitePng(8, 8) });
  });
  await openProviders(page);
  const dialog = page.getByRole("dialog", { name: "AI providers" });
  await dialog.getByLabel("Name", { exact: true }).fill("Mock cloud");
  await dialog.getByRole("textbox", { name: "Base URL" }).fill("https://ai.mock.test/v1");
  await dialog.getByLabel("API key").fill("test-key-2222");
  await dialog.getByRole("button", { name: "Add provider" }).click();
  await dialog.getByRole("combobox", { name: "Provider for Subject selection" }).click();
  await page.getByRole("option", { name: "Mock cloud" }).click();
  await dialog.getByRole("button", { name: "Done" }).click();

  await page
    .getByRole("button", { name: /Siemens star/ })
    .first()
    .click();
  await expect(page.getByRole("contentinfo")).toContainText("512 x 512 px");
  const aiSubject = async () => {
    await page.getByRole("menuitem", { name: "Select", exact: true }).click();
    await page.getByRole("menuitem", { name: "AI subject", exact: true }).click();
  };

  await aiSubject();
  const consent = page.getByRole("dialog", { name: "Send to Mock cloud?" });
  await expect(consent).toBeVisible();
  expect(requests).toBe(0);
  await consent.getByRole("button", { name: "Cancel" }).click();
  await expect(consent).toBeHidden();
  expect(requests).toBe(0);

  await aiSubject();
  await consent.getByRole("button", { name: "Send once" }).click();
  await expect(page.getByRole("contentinfo")).toContainText("Selection: the whole image");
  expect(requests).toBe(1);
  await expect(page.getByRole("contentinfo")).toContainText(
    "AI result. Detail may not exist in the original scene.",
  );

  // Every request asks again.
  await aiSubject();
  await expect(consent).toBeVisible();
  await consent.getByRole("button", { name: "Cancel" }).click();
  expect(requests).toBe(1);

  // Local work never asks: the classical subject runs with no dialog.
  await page.getByRole("menuitem", { name: "Select", exact: true }).click();
  await page.getByRole("menuitem", { name: "Subject", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(requests).toBe(1);
});
