// Figures and worked examples for hysteresis thresholding and Canny.
// gen-filter-docs.mjs calls cannyDocs with its helpers. Every number comes from the filter code.

export function cannyDocs(h) {
  const { run, pic, figure, example, mdTable, synthetic, planeAt, fix } = h;
  const noisy = run(synthetic.disks(120, 120), "noise-gaussian", {
    sigma: 12,
    seed: 5,
    monochrome: true,
  });
  const lum = { channelScope: "luminance" };
  // Disks shaded from dim on the left to full contrast on the right, so each outline is strong
  // on one side and weak on the other.
  const plain = synthetic.disks(120, 120);
  const shaded = {
    ...plain,
    data: plain.data.map((v, i) =>
      i % 4 === 3 ? v : Math.round(v * (0.25 + (0.75 * ((i >> 2) % 120)) / 119)),
    ),
  };
  const shadedNoisy = run(shaded, "noise-gaussian", { sigma: 6, seed: 5, monochrome: true });
  const magnitude = run(run(shadedNoisy, "gaussian", { sigma: 1 }), "sobel", {
    ...lum,
    outputMapping: "clip",
  });
  const hyst = (low, high) =>
    pic(run(magnitude, "hysteresis", { ...lum, low, high, outputMapping: "clip" }));
  figure("hysteresis", {
    message:
      "A low threshold alone keeps faint isolated spots. A high threshold alone breaks the dim outlines. Hysteresis keeps whole outlines and drops spots that touch no strong pixel.",
    panels: [
      { title: "Sobel magnitude", image: pic(magnitude) },
      { title: "Threshold 45", image: hyst(45, 45) },
      { title: "Threshold 200", image: hyst(200, 200) },
      { title: "Hysteresis 45 and 200", image: hyst(45, 200) },
    ],
  });

  const values = [30, 70, 120, 80, 60, 20, 90, 40];
  const rows = [values];
  const kept = values.map((_, x) => planeAt("hysteresis", rows, { low: 50, high: 100 }, x, 0));
  example(
    "hysteresis",
    mdTable(
      ["x", ...values.map((_, x) => String(x))],
      [
        ["Value", ...values.map(String)],
        ["Class", ...values.map((v) => (v >= 100 ? "strong" : v >= 50 ? "weak" : "-"))],
        ["Result", ...kept.map(String)],
      ],
    ) +
      `\nOne row of values with low threshold 50 and high threshold 100. Only x = 2 is strong. The weak pixels at x = 1, 3 and 4 touch it through a chain of weak pixels, so they are kept. The value ${values[6]} at x = 6 is weak, but the ${values[5]} at x = 5 cuts it off from every strong pixel, so it becomes 0.\n`,
  );

  const stage = (name) =>
    pic(run(noisy, "canny", { ...lum, sigma: 1.5, low: 40, high: 100, stage: name }));
  figure("canny", {
    message:
      "The five stages of Canny on noisy disks: blur, gradient magnitude, thinning, double threshold and hysteresis.",
    panels: [
      { title: "Input", image: pic(noisy) },
      { title: "1. Smoothed", image: stage("smoothed") },
      { title: "2. Magnitude", image: stage("magnitude") },
      { title: "3. Thinned", image: stage("suppressed") },
      { title: "4. Two thresholds", image: stage("thresholds") },
      { title: "5. Edges", image: stage("edges") },
    ],
  });

  const line = [40, 40, 40, 40, 40, 40, 40, 100, 215, 215, 215, 215, 215, 215];
  const edgeRows = Array.from({ length: 6 }, () => line);
  const xs = [5, 6, 7, 8, 9, 10];
  const params = { sigma: 1, low: 40, high: 100 };
  const at = (name, x) => planeAt("canny", edgeRows, { ...params, stage: name }, x, 2);
  const smooth = xs.map((x) => at("smoothed", x));
  const mag = xs.map((x) => at("magnitude", x));
  const thin = xs.map((x) => at("suppressed", x));
  const edges = xs.map((x) => at("edges", x));
  const peak = xs[thin.findIndex((v) => v > 0)];
  example(
    "canny",
    mdTable(
      ["x", ...xs.map(String)],
      [
        ["Input", ...xs.map((x) => String(line[x]))],
        ["1. Smoothed", ...smooth.map((v) => fix(v, 1))],
        ["2. Magnitude", ...mag.map((v) => fix(v, 1))],
        ["3. Thinned", ...thin.map((v) => fix(v, 1))],
        ["5. Edges", ...edges.map(String)],
      ],
    ) +
      `\nA vertical edge with one in-between pixel at x = 7, and sigma 1, low threshold 40 and high threshold 100. Every row is the same, so the gradient points along x and each pixel is compared with its left and right neighbors. The magnitude peaks at x = ${peak}, and only that pixel survives thinning. Its value, ${fix(Math.max(...thin), 1)}, is above 100, so it is a strong pixel and becomes an edge. The edge is one pixel wide.\n`,
  );
}
