import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

test("the studio can be installed and opens and filters offline", async ({ page, context }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = (await (await page.request.get(href ?? "")).json()) as {
    name: string;
    icons: unknown[];
  };
  expect(manifest.name).toBe("PixelNexus");
  expect(manifest.icons.length).toBeGreaterThan(0);

  // Wait until the service worker has stored the studio, then load the page under its control.
  await page.evaluate("navigator.serviceWorker.ready.then(() => true)");
  await page.reload();
  await expect.poll(() => page.evaluate("Boolean(navigator.serviceWorker.controller)")).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: /Siemens star/ })
    .first()
    .click();
  await expect(page.getByRole("contentinfo")).toContainText("512 x 512 px");
  await page.getByRole("button", { name: "Open the Library" }).click();
  await page.getByRole("searchbox", { name: "Search filters" }).fill("gaussian");
  await page
    .getByRole("region", { name: "Filters" })
    .getByRole("button", { name: /^Gaussian filter/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByTestId("announcer")).toContainText("Applied Gaussian filter");
  await context.setOffline(false);
});
