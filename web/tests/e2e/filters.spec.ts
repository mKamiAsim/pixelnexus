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

test("the Stage viewer shows every stage of Canny", async ({ page }) => {
  await openTestImage(page, "Siemens star");
  await chooseFilter(page, "canny", "Canny");
  await front(page, "Learn");
  await expect(page.getByRole("heading", { name: "Stage viewer" })).toBeVisible();
  for (const stage of [
    "1. Smoothed image",
    "3. After non-maximum suppression",
    "5. Edges after hysteresis",
  ]) {
    await expect(page.getByRole("img", { name: `${stage}, patch around the probe` })).toBeVisible();
  }
});

test("the Point-op curve shows the equalization curve and both histograms", async ({ page }) => {
  await openTestImage(page, "Disks");
  await chooseFilter(page, "equaliz", "Histogram equalization");
  await front(page, "Learn");
  await expect(page.getByRole("heading", { name: "Point-op curve" })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Transfer curve/ })).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Histogram of the luma before the filter" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Histogram of the luma after the filter" }),
  ).toBeVisible();
});

test("the Point-op curve shows the local curve of CLAHE at the probe", async ({ page }) => {
  await openTestImage(page, "Disks");
  await chooseFilter(page, "clahe", "CLAHE");
  await front(page, "Learn");
  await expect(page.getByRole("img", { name: /^Transfer curve/ })).toBeVisible();
  await expect(page.getByText(/The one shown applies at the probe pixel/)).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Histogram of the luma after the filter" }),
  ).toBeVisible();
});

test("the color control takes the neutral color from the probe pixel", async ({ page }) => {
  await openTestImage(page, "Disks");
  await chooseFilter(page, "white bal", "White balance");
  await front(page, "Properties");
  const field = page.getByRole("textbox", { name: "Neutral color", exact: true });
  await expect(field).toHaveValue("#d2c8b4");
  await page.getByRole("button", { name: "Use probe pixel" }).click();
  // Without a probe, the center pixel is used: the gray background of the test image.
  await expect(field).toHaveValue("#1e1e1e");
});

const ENGINE = "http://127.0.0.1:8765/api/v1";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Expose-Headers": "X-Width, X-Height",
};

interface FakeJob {
  readonly image: string;
  readonly mask?: string;
  readonly params: Record<string, unknown>;
}

/** Enlarge raw RGBA by a whole factor, copying each pixel. */
function enlarge(body: Buffer, width: number, height: number, scale: number): Buffer {
  const out = Buffer.alloc(width * height * scale * scale * 4);
  for (let y = 0; y < height * scale; y++) {
    for (let x = 0; x < width * scale; x++) {
      const from = (Math.floor(y / scale) * width + Math.floor(x / scale)) * 4;
      body.copy(out, (y * width * scale + x) * 4, from, from + 4);
    }
  }
  return out;
}

/**
 * A stand-in for the local engine on its usual address. It keeps each upload and each job, runs
 * every job at once, and returns the job's image unchanged as the result, or enlarged by the
 * scale parameter when there is one. The representation is a fixed answer in the engine's
 * format. Then the studio reloads, so it finds the engine.
 */
async function fakeEngine(page: Page) {
  const images = new Map<string, { body: Buffer; width: string; height: string }>();
  const jobs: FakeJob[] = [];
  let last = "";
  await page.route(`${ENGINE}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: CORS, json: body });
    if (path === "/info") return json({ version: "0.1.0" });
    if (path === "/images") {
      last = `image-${images.size}`;
      const width = url.searchParams.get("width") ?? "0";
      const height = url.searchParams.get("height") ?? "0";
      images.set(last, { body: request.postDataBuffer() ?? Buffer.alloc(0), width, height });
      return json({ id: last, width: Number(width), height: Number(height) });
    }
    if (path === "/jobs") {
      const job = request.postDataJSON() as FakeJob;
      jobs.push(job);
      last = `job-${jobs.length - 1}`;
      return json({ id: last, state: "queued", progress: 0 }, 202);
    }
    if (path.endsWith("/events")) {
      const done = { id: last, state: "done", progress: 1, error: null };
      return route.fulfill({
        headers: { ...CORS, "Content-Type": "text/event-stream" },
        body: `event: status\ndata: ${JSON.stringify(done)}\n\n`,
      });
    }
    if (path.endsWith("/result")) {
      const job = jobs[Number((path.split("/")[2] ?? "").replace("job-", ""))];
      const image = images.get(job?.image ?? "");
      if (!image) return json({ detail: "There is no job with this id." }, 404);
      const scale = Number(job?.params.scale ?? 1);
      const [width, height] = [Number(image.width), Number(image.height)];
      return route.fulfill({
        headers: { ...CORS, "X-Width": String(width * scale), "X-Height": String(height * scale) },
        contentType: "application/octet-stream",
        body: scale === 1 ? image.body : enlarge(image.body, width, height, scale),
      });
    }
    if (path.endsWith("/representation")) {
      return json({
        kind: "stages",
        stages: [
          { name: "Analysis", formula: "J = 3", note: "PyWavelets wavedec2 with sym4." },
          { name: "Filter taps", formula: "f = (0.7071,\\ 0.7071)" },
        ],
      });
    }
    return json({ detail: "Not in the stand-in engine." }, 404);
  });
  await page.reload();
  return { images, jobs };
}

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

test("an engine filter runs in the local engine, with its operator and the Noise lab", async ({
  page,
}) => {
  await fakeEngine(page);
  await openTestImage(page, "Noise patches");
  await expect(page.getByRole("button", { name: "Local engine: on" })).toBeVisible();
  await chooseFilter(page, "wavelet", "Wavelet thresholding");
  await front(page, "Properties");
  await expect(page.getByText("There is no live preview.")).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await applied(page, "Wavelet thresholding");
  await front(page, "Inspector");
  await page.getByRole("tab", { name: "Operator" }).click();
  await expect(page.getByText("Filter taps")).toBeVisible();
  await expect(page.getByText("PyWavelets wavedec2 with sym4.")).toBeVisible();
  await front(page, "Learn");
  await expect(page.getByRole("heading", { name: "Noise lab" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Noise lab metrics" })).toContainText("dB");
});

test("the Iteration viewer runs an engine filter at growing iteration counts", async ({ page }) => {
  await fakeEngine(page);
  await openTestImage(page, "Disks");
  await expect(page.getByRole("button", { name: "Local engine: on" })).toBeVisible();
  await chooseFilter(page, "total variation", "Total variation restoration");
  await front(page, "Learn");
  await expect(page.getByRole("heading", { name: "Iteration viewer" })).toBeVisible();
  await expect(page.getByText("once for each of the 4 counts on the plot")).toBeVisible();
  await expect(page.getByRole("img", { name: "Estimate after iteration 100" })).toBeVisible();
});

test("the Line profile runs an engine filter on the patch around the probe", async ({ page }) => {
  await fakeEngine(page);
  await openTestImage(page, "Disks");
  await expect(page.getByRole("button", { name: "Local engine: on" })).toBeVisible();
  await chooseFilter(page, "debanding", "Debanding");
  await front(page, "Learn");
  await expect(page.getByRole("heading", { name: "Line profile" })).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Brightness along the row through the probe pixel/ }),
  ).toBeVisible();
});

test("inpainting sends the selection to the engine as its mask", async ({ page }) => {
  const engine = await fakeEngine(page);
  await openTestImage(page, "Disks");
  await expect(page.getByRole("button", { name: "Local engine: on" })).toBeVisible();
  await chooseFilter(page, "inpainting", "Image inpainting");
  await front(page, "Properties");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("Select the area first", { exact: true })).toBeVisible();
  expect(engine.jobs).toHaveLength(0);
  await marquee(page, [-40, -40], [40, 40]);
  await expect(page.getByRole("contentinfo")).toContainText("Selection:");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await applied(page, "Image inpainting");
  const job = engine.jobs.at(-1);
  const mask = engine.images.get(job?.mask ?? "");
  expect(mask?.width).toBe("512");
  const reds = [...(mask?.body ?? [])].filter((_, i) => i % 4 === 0);
  const selected = reds.filter((v) => v === 255).length;
  expect(selected).toBeGreaterThan(1000);
  expect(selected).toBeLessThan((512 * 512) / 2);
  await front(page, "Learn");
  await expect(page.getByText("the hole is a disk of radius 8 pixels")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Filled image, patch around the probe" }),
  ).toBeVisible();
});

test("super-resolution replaces the image with the larger engine result", async ({ page }) => {
  await fakeEngine(page);
  await openTestImage(page, "Disks");
  await expect(page.getByRole("button", { name: "Local engine: on" })).toBeVisible();
  await chooseFilter(page, "super-resolution", "Super-resolution reconstruction");
  await front(page, "Properties");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await applied(page, "Super-resolution reconstruction");
  await expect(page.getByRole("contentinfo")).toContainText("1024 x 1024 px");
  await front(page, "Learn");
  await expect(page.getByText("measured from the start at 0 iterations")).toBeVisible();
  await expect(page.getByRole("img", { name: "Estimate after iteration 10" })).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("contentinfo")).toContainText("512 x 512 px");
});

test("the studio works with the local engine stopped", async ({ page }) => {
  // Whatever runs on this machine, the studio must find no engine here.
  await page.route(`${ENGINE}/**`, (route) => route.abort());
  await page.reload();
  await openTestImage(page, "Disks");
  await expect(page.getByRole("button", { name: "Local engine: off" })).toBeVisible();
  await chooseFilter(page, "gaussian", "Gaussian filter");
  await front(page, "Properties");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await applied(page, "Gaussian filter");
});

test("scale space shows its response and its selected scale", async ({ page }) => {
  await openTestImage(page, "Disks");
  await chooseFilter(page, "scale", "Scale-space filtering");
  await front(page, "Inspector");
  await page.getByRole("tab", { name: "Operator" }).click();
  await expect(page.getByText("Normalized measure")).toBeVisible();
  await front(page, "Learn");
  await expect(page.getByRole("heading", { name: "Stage viewer" })).toBeVisible();
  for (const stage of ["Strongest response", "Selected scale"]) {
    await expect(page.getByRole("img", { name: `${stage}, patch around the probe` })).toBeVisible();
  }
});

test("the structuring element editor shapes erosion, and the stepper shows it", async ({
  page,
}) => {
  await openTestImage(page, "Disks and dots");
  await chooseFilter(page, "erosion", "Erosion");
  await front(page, "Properties");
  await expect(
    page.getByRole("img", { name: "Structuring element, 3 by 3, 5 pixels" }).first(),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Structuring element shape" }).click();
  await page.getByRole("option", { name: "Rectangle" }).click();
  await expect(
    page.getByRole("img", { name: "Structuring element, 5 by 3, 15 pixels" }).first(),
  ).toBeVisible();
  await front(page, "Learn");
  await expect(page.getByRole("heading", { name: "Morphology stepper" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Values under the element" })).toBeVisible();
  await expect(page.getByText("Erosion keeps the smallest.")).toBeVisible();
});

test("a click in the Spectrum panel places a notch for the notch-reject filter", async ({
  page,
}) => {
  await openTestImage(page, "Disks and dots");
  // Stripes every 8 pixels make a peak at fx = 0.125 cycles per pixel.
  await chooseFilter(page, "periodic noise", "Add periodic noise");
  await front(page, "Properties");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await applied(page, "Add periodic noise");
  await chooseFilter(page, "notch", "Notch-reject");
  await front(page, "Spectrum");
  const spectrum = page.getByRole("img", {
    name: /Log magnitude spectrum of the image, with 1 notch$/,
  });
  await expect(spectrum).toBeVisible();
  const box = await spectrum.boundingBox();
  if (!box) throw new Error("The spectrum has no size.");
  // The 512 x 512 spectrum has frequency 0 at column and row 256, so column 320 is fx = 0.125.
  // The click lands one step away from the peak and snaps to it.
  await spectrum.click({
    position: { x: (box.width * 321.5) / 512, y: (box.height * 257.5) / 512 },
  });
  await expect(
    page.getByRole("img", { name: /Log magnitude spectrum of the image, with 2 notches$/ }),
  ).toBeVisible();
  await front(page, "Properties");
  await expect(page.getByRole("textbox", { name: "Notches" })).toHaveValue("0.2 0.1\n0.125 0");
});

test("planned filters are listed but cannot run", async ({ page }) => {
  await openTestImage(page, "Siemens star");
  await chooseFilter(page, "dncnn", "DnCNN");
  await front(page, "Properties");
  await expect(page.getByText(/This filter is planned for Phase/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
});

test("the Iteration viewer shows how anisotropic diffusion settles", async ({ page }) => {
  await openTestImage(page, "Noise patches");
  await chooseFilter(page, "anisotropic", "Anisotropic diffusion");
  await front(page, "Learn");
  await expect(page.getByRole("heading", { name: "Iteration viewer" })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Convergence over 15 iterations/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "Estimate after iteration 15" })).toBeVisible();
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
  await page.getByRole("menuitem", { name: "Sobel", exact: true }).click();
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
