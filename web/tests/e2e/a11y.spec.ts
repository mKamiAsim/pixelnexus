import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Accessibility audit (PLAN.md Phase 10). Every theme, the workspace with each panel, and each
 * dialog that the other tests do not scan. A dialog must close with Escape and give the focus back.
 */

const THEMES = ["light", "dim", "dark", "midnight", "contrast"] as const;

/** Dialogs opened from the menu bar: menu, item, and the dialog's accessible name. */
const DIALOGS = [
  ["File", "Export...", /Export/],
  ["Edit", "Preferences...", /Preferences/],
  ["Image", "Resize...", /Resize/],
  ["Image", "Rotate by angle...", /Rotate/],
  ["Help", "Keyboard shortcuts", /Keyboard shortcuts/],
] as const;

async function seriousIssues(page: Page, include?: string): Promise<string[]> {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
  if (include) builder = builder.include(include);
  const results = await builder.analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.help} ${v.nodes[0]?.target.join(" ")}`);
}

for (const theme of THEMES) {
  test(`the ${theme} theme has no serious issues in the workspace and the dialogs`, async ({
    page,
  }) => {
    // Many scans take longer than the default timeout.
    test.slow();
    await page.addInitScript((id) => localStorage.setItem("pixelnexus.theme", id), theme);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page
      .getByRole("button", { name: /Siemens star/ })
      .first()
      .click();
    await expect(page.getByRole("contentinfo")).toContainText("512 x 512 px");

    const problems: string[] = [];
    for (const tab of ["Properties", "Library", "Inspector", "Learn", "History", "Layers"]) {
      const handle = page.locator(".dv-tab:visible", { hasText: tab }).first();
      if (!(await handle.count())) continue;
      await handle.click();
      problems.push(...(await seriousIssues(page)).map((p) => `${tab}: ${p}`));
    }

    for (const [menu, item, name] of DIALOGS) {
      await page.getByRole("menuitem", { name: menu, exact: true }).click();
      await page.getByRole("menuitem", { name: item }).click();
      const dialog = page.getByRole("dialog", { name });
      await expect(dialog).toBeVisible();
      problems.push(...(await seriousIssues(page, '[role="dialog"]')).map((p) => `${item} ${p}`));
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      // The focus goes back into the studio, not to the page body.
      await expect
        .poll(() => page.evaluate("document.activeElement === document.body"))
        .toBe(false);
    }
    expect(problems).toEqual([]);
  });
}

test("the command palette opens from the keyboard and runs a command", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Siemens star/ })
    .first()
    .click();
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: /Command palette/ });
  await expect(palette).toBeVisible();
  expect(await seriousIssues(page, '[role="dialog"]')).toEqual([]);
  await page.keyboard.type("Zoom in");
  await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();
  await expect(page.getByRole("contentinfo")).toContainText(/Zoom (?!100%)/);
});

test("the workspace can be walked with the Tab key, and every stop shows a focus ring", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Siemens star/ })
    .first()
    .click();
  await expect(page.getByRole("contentinfo")).toContainText("512 x 512 px");
  const stops = new Set<string>();
  const unmarked: string[] = [];
  let last = "";
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const stop = (await page.evaluate(`(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      // A ring on the element, on its ::after, or on a parent up to three levels up that
      // draws it with focus-within, as the search fields do.
      const ringOf = (style) =>
        (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2) ||
        style.boxShadow !== "none";
      let marked = ringOf(getComputedStyle(el)) || ringOf(getComputedStyle(el, "::after"));
      for (let p = el.parentElement, i = 0; p && i < 3 && !marked; p = p.parentElement, i++)
        marked = ringOf(getComputedStyle(p));
      const name = el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30) || el.tagName;
      return { name: el.tagName + " " + name, marked };
    })()`)) as { name: string; marked: boolean } | null;
    if (!stop) continue;
    // Past the last control, Firefox leaves the page and the focus stays put. That is the end.
    if (stops.has(stop.name) && last === stop.name) break;
    last = stop.name;
    stops.add(stop.name);
    if (!stop.marked) unmarked.push(stop.name);
  }
  // The Tab key moves through every part of the workspace, up to the status bar.
  expect(stops.size).toBeGreaterThan(12);
  expect([...stops].some((name) => name.includes("Local engine"))).toBe(true);
  expect([...new Set(unmarked)]).toEqual([]);
});

test("an image can be opened, filtered and undone with the keyboard only", async ({ page }) => {
  await page.goto("/");
  // The first Tab stop skips the panels and lands on the start screen.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Skip to the image" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /Open file/ })).toBeFocused();
  // Tab on to a test image and open it with Enter.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const text = (await page.evaluate("document.activeElement?.textContent ?? ''")) as string;
    if (text.includes("Siemens star")) break;
  }
  await page.keyboard.press("Enter");
  await expect(page.getByRole("contentinfo")).toContainText("512 x 512 px");
  // Choose a filter in the command palette, then apply it.
  await page.keyboard.press("Control+k");
  await page.keyboard.type("Gaussian filter");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /Command palette/ })).toBeHidden();
  await page.keyboard.press("Control+Enter");
  await expect(page.getByTestId("announcer")).toContainText("Applied Gaussian filter");
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("announcer")).toContainText("Undid Gaussian filter");
  // With an image open, the skip button goes to the canvas.
  await page.keyboard.press("Shift+Tab");
  await page.locator("body").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.locator('canvas[tabindex="0"]')).toBeFocused();
});

test("Ctrl+Enter applies and Ctrl+Z undoes while a number field has focus", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Siemens star/ })
    .first()
    .click();
  await page.keyboard.press("Control+k");
  await page.keyboard.type("Gaussian filter");
  await page.keyboard.press("Enter");
  const sigma = page.getByRole("textbox", { name: "Sigma" });
  await sigma.click();
  await sigma.fill("6");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByTestId("announcer")).toContainText("Applied Gaussian filter (sigma 6 px)");
  await expect(sigma).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("announcer")).toContainText("Undid Gaussian filter (sigma 6 px)");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByTestId("announcer")).toContainText("Redid Gaussian filter (sigma 6 px)");
});
