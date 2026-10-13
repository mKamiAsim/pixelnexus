// Figures and worked examples for the Phase 5b edge-preserving filters.
// gen-filter-docs.mjs calls edgeDocs with its helpers. Every number comes from the filter code.

export function edgeDocs(h) {
  const { run, pic, row, figure, example, planeAt, matrix, block, mdTable, fix, synthetic } = h;
  const { browserFilter, kuwaharaRegions, nagaoRegions } = h;

  /** Run a color filter on a small RGB window and return the center color. */
  const colorAt = (id, colors, params) => {
    const n = Math.round(Math.sqrt(colors.length));
    const planes = [0, 1, 2].map((c) => ({
      width: n,
      height: n,
      data: Float32Array.from(colors.map((v) => v[c])),
    }));
    const out = browserFilter(id).color(planes, params, {
      border: "reflect101",
      originX: 0,
      originY: 0,
      channel: 0,
    });
    const center = (colors.length - 1) / 2;
    return [0, 1, 2].map((c) => out[c].data[center]);
  };
  const gray = (rows) => rows.flat().map((v) => [v, v, v]);
  /** Index of the smallest variance, the first one on a tie, as in the filter. */
  const argmin = (list) =>
    list.reduce((best, s, i) => (s.variance < list[best].variance - 1e-9 ? i : best), 0);

  const noisy = run(synthetic.disks(96, 96), "noise-gaussian", { sigma: 20, seed: 21 });
  figure("kuwahara", {
    message:
      "The Kuwahara filter flattens the noise and keeps the disk edges. Larger windows look more painted.",
    panels: [
      { title: "Gaussian noise", image: pic(noisy) },
      { title: "Box 5x5", image: pic(run(noisy, "box", { size: 5 })) },
      { title: "Kuwahara 5", image: pic(run(noisy, "kuwahara", { size: 5 })) },
      { title: "Kuwahara 9", image: pic(run(noisy, "kuwahara", { size: 9 })) },
    ],
  });
  const nagao1 = run(noisy, "nagao-matsuyama", {});
  const nagao3 = run(run(nagao1, "nagao-matsuyama", {}), "nagao-matsuyama", {});
  figure("nagao-matsuyama", {
    message:
      "One pass smooths a little. Three passes smooth more, and the small disks keep their round shape.",
    panels: [
      { title: "Gaussian noise", image: pic(noisy) },
      { title: "One pass", image: pic(nagao1) },
      { title: "Three passes", image: pic(nagao3) },
    ],
  });

  const edge = run(synthetic.stepEdge(64, 16), "noise-gaussian", { sigma: 12, seed: 22 });
  const xs = Array.from({ length: 41 }, (_, i) => i + 12);
  const slice = (image) => row(image, 8).slice(12, 53);
  figure("bilateral", {
    message:
      "The Gaussian blur smooths the noise and the edge. The bilateral filter smooths the noise and keeps the edge.",
    profile: {
      x: xs,
      xlabel: "x (pixels)",
      ylabel: "Value",
      lines: [
        { label: "Noisy edge", values: slice(edge) },
        { label: "Gaussian, sigma 3", values: slice(run(edge, "gaussian", { sigma: 3 })) },
        {
          label: "Bilateral, sigma_s 3, sigma_r 40",
          values: slice(run(edge, "bilateral", { sigmaSpace: 3, sigmaRange: 40 })),
        },
      ],
    },
  });
  figure("guided", {
    message: "A small eps keeps the edge and some noise. A larger eps smooths more of both.",
    profile: {
      x: xs,
      xlabel: "x (pixels)",
      ylabel: "Value",
      lines: [
        { label: "Noisy edge", values: slice(edge) },
        { label: "r 4, eps 0.01", values: slice(run(edge, "guided", { radius: 4, eps: 0.01 })) },
        { label: "r 4, eps 0.1", values: slice(run(edge, "guided", { radius: 4, eps: 0.1 })) },
      ],
    },
  });
  figure("anisotropic-diffusion", {
    message:
      "More iterations remove more noise. The disk edges stay sharp, unlike with a Gaussian blur.",
    panels: [
      { title: "Gaussian noise", image: pic(noisy) },
      {
        title: "5 iterations",
        image: pic(run(noisy, "anisotropic-diffusion", { iterations: 5, kappa: 30 })),
      },
      {
        title: "20 iterations",
        image: pic(run(noisy, "anisotropic-diffusion", { iterations: 20, kappa: 30 })),
      },
      { title: "Gaussian, sigma 2", image: pic(run(noisy, "gaussian", { sigma: 2 })) },
    ],
  });
  const hues = run(synthetic.hueSweep(96, 48), "noise-gaussian", { sigma: 18, seed: 23 });
  figure("vector-anisotropic-diffusion", {
    message: "Both remove the noise. The vector version stops at the same place in all channels.",
    panels: [
      { title: "Noisy colors", image: pic(hues, true) },
      {
        title: "Per channel",
        image: pic(run(hues, "anisotropic-diffusion", { iterations: 15, kappa: 25 }), true),
      },
      {
        title: "Vector",
        image: pic(run(hues, "vector-anisotropic-diffusion", { iterations: 15, kappa: 43 }), true),
      },
    ],
  });

  // Worked examples ------------------------------------------------------------------------

  const K = [
    [20, 22, 21, 200, 202],
    [19, 21, 20, 201, 199],
    [22, 20, 120, 200, 203],
    [21, 19, 22, 198, 200],
    [20, 23, 21, 202, 201],
  ];
  const stats = (region) => {
    const v = region.map(([dx, dy]) => K[2 + dy][2 + dx]);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const variance = v.reduce((a, b) => a + b * b, 0) / v.length - mean * mean;
    return { mean, variance };
  };
  const quads = kuwaharaRegions(2).map(stats);
  const names = ["Top left", "Top right", "Bottom left", "Bottom right"];
  example(
    "kuwahara",
    block(`W = ${matrix(K)}`) +
      `\nA 5x5 window on a vertical edge, with a noisy center pixel of 120. Each quadrant is 3x3 and holds the center.\n\n` +
      mdTable(
        ["Quadrant", "Mean", "Variance"],
        quads.map((q, i) => [names[i], fix(q.mean, 2), fix(q.variance, 1)]),
      ) +
      `\nThe two right quadrants cross the edge, so their variance is large. The ${names[argmin(quads)].toLowerCase()} quadrant has the smallest variance, so the output is its mean, **${fix(colorAt("kuwahara", gray(K), { size: 5 })[0], 2)}**. The edge is not blurred, and the noisy center is pulled to the dark side it belongs to.\n`,
  );

  const N = [
    [20, 20, 20, 21, 200],
    [21, 19, 20, 200, 201],
    [20, 22, 60, 199, 200],
    [19, 200, 201, 200, 202],
    [200, 199, 201, 202, 200],
  ];
  const regionNames = [
    "Center",
    "North",
    "East",
    "South",
    "West",
    "North-west",
    "North-east",
    "South-east",
    "South-west",
  ];
  const nStats = nagaoRegions().map((region) => {
    const v = region.map(([dx, dy]) => N[2 + dy][2 + dx]);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    return { mean, variance: v.reduce((a, b) => a + b * b, 0) / v.length - mean * mean };
  });
  example(
    "nagao-matsuyama",
    block(`W = ${matrix(N)}`) +
      `\nA diagonal edge runs from the top right to the bottom left. The center pixel, 60, lies on the dark side.\n\n` +
      mdTable(
        ["Subregion", "Mean", "Variance"],
        nStats.map((s, i) => [regionNames[i], fix(s.mean, 2), fix(s.variance, 1)]),
      ) +
      `\nThe ${regionNames[argmin(nStats)].toLowerCase()} subregion lies on the dark side and varies the least, so the output is its mean, **${fix(colorAt("nagao-matsuyama", gray(N), {})[0], 2)}**. The east, south and south-east shapes reach across the edge and vary much more.\n`,
  );

  const B = [
    [50, 52, 200],
    [48, 50, 202],
    [51, 49, 199],
  ];
  const sR = 30;
  const near = Math.exp(-(2 * 2) / (2 * sR * sR));
  const far = Math.exp(-(150 * 150) / (2 * sR * sR));
  const sp = Math.exp(-1 / 2);
  example(
    "bilateral",
    block(`W = ${matrix(B)}`) +
      `\nThe center 50 sits next to an edge. With sigma_s = 1 and sigma_r = ${sR}, compare its left and right neighbors, both at distance 1:\n\n` +
      mdTable(
        ["Neighbor", "Value", "Distance weight", "Value weight", "Product"],
        [
          ["Left", "48", fix(sp, 4), fix(near, 4), fix(sp * near, 4)],
          ["Right", "202", fix(sp, 4), far.toExponential(2), (sp * far).toExponential(2)],
        ],
      ) +
      `\nThe right neighbor is across the edge, so its weight is about ${fix((sp * near) / (sp * far) / 1000, 0)} thousand times smaller. The filter gives **${fix(colorAt("bilateral", gray(B), { sigmaSpace: 1, sigmaRange: sR })[0], 2)}** for the center of this 3x3 image, close to the dark values. A Gaussian blur of the same window would be pulled toward 200.\n`,
  );

  const flat = [52, 49, 51, 50, 48, 50, 53, 47, 50];
  const step = [40, 40, 200, 40, 40, 200, 40, 40, 200];
  const eps = 0.01 * 255 * 255;
  const line = (v) => {
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const variance = v.reduce((a, b) => a + b * b, 0) / v.length - mean * mean;
    const a = variance / (variance + eps);
    return { mean, variance, a, b: mean - a * mean };
  };
  const f = line(flat);
  const s = line(step);
  example(
    "guided",
    `With the input as its own guide, a = var / (var + eps). For eps = 0.01, scaled to 8 bits, eps = 0.01 x 255 squared = ${fix(eps, 2)}. Two 3x3 windows:\n\n` +
      mdTable(
        ["Window", "Mean", "Variance", "a", "b"],
        [
          ["Flat with noise", fix(f.mean, 2), fix(f.variance, 2), fix(f.a, 4), fix(f.b, 2)],
          ["Edge, 40 and 200", fix(s.mean, 2), fix(s.variance, 1), fix(s.a, 4), fix(s.b, 2)],
        ],
      ) +
      `\nIn the flat window a is near 0, so the model a I + b is almost the constant ${fix(f.mean, 1)}, the mean, and the noise is removed. In the edge window a is near 1 and b is small, so the model keeps I, and the edge stays. The output of a pixel averages a and b over all windows that hold it.\n`,
  );

  const D = [
    [60, 64, 60],
    [100, 70, 200],
    [60, 78, 60],
  ];
  const kappa = 20;
  const g = (d) => Math.exp(-((d / kappa) ** 2));
  const diffs = [
    ["North", 64 - 70],
    ["South", 78 - 70],
    ["East", 200 - 70],
    ["West", 100 - 70],
  ];
  const total = diffs.reduce((acc, [, d]) => acc + g(Math.abs(d)) * d, 0);
  example(
    "anisotropic-diffusion",
    block(`W = ${matrix(D)}`) +
      `\nOne step for the center pixel 70, with K = ${kappa}, lambda = 0.2 and the exponential conduction:\n\n` +
      mdTable(
        ["Neighbor", "Difference d", "g(d)", "g(d) d"],
        diffs.map(([n, d]) => [n, String(d), fix(g(Math.abs(d)), 4), fix(g(Math.abs(d)) * d, 3)]),
      ) +
      `\nThe sum is ${fix(total, 3)}, so the new value is 70 + 0.2 x ${fix(total, 3)} = **${fix(planeAt("anisotropic-diffusion", D, { iterations: 1, kappa, lambda: 0.2 }, 1, 1), 3)}**. The east neighbor 200 is across an edge, so its conduction is almost 0 and it does not pull the pixel. The small differences to the north and south flow freely.\n`,
  );

  const center = [120, 60, 60];
  const neighbors = [
    ["North", [126, 62, 58]],
    ["South", [118, 64, 61]],
    ["East", [60, 120, 60]],
    ["West", [124, 57, 63]],
  ];
  const vk = 30;
  const vg = (d) => Math.exp(-((d / vk) ** 2));
  const rows = neighbors.map(([name, c]) => {
    const d = c.map((v, k) => v - center[k]);
    const length = Math.hypot(...d);
    return { name, c, d, length, g: vg(length) };
  });
  const colors = [
    [255, 0, 255],
    rows[0].c,
    [255, 0, 255],
    rows[3].c,
    center,
    rows[2].c,
    [255, 0, 255],
    rows[1].c,
    [255, 0, 255],
  ];
  const result = colorAt("vector-anisotropic-diffusion", colors, {
    iterations: 1,
    kappa: vk,
    lambda: 0.2,
  });
  example(
    "vector-anisotropic-diffusion",
    `One step for a red pixel (120, 60, 60), with K = ${vk} and lambda = 0.2. Its east neighbor is green.\n\n` +
      mdTable(
        ["Neighbor", "Color", "Color difference", "Length", "g"],
        rows.map((r) => [
          r.name,
          `(${r.c.join(", ")})`,
          `(${r.d.join(", ")})`,
          fix(r.length, 2),
          fix(r.g, 4),
        ]),
      ) +
      `\nThe green neighbor has a color difference of length ${fix(rows[2].length, 1)}, so its conduction is almost 0 in all three channels. The red neighbors flow in. The new color is **(${result.map((v) => fix(v, 2)).join(", ")})**, still red. The corners of the window do not take part, because only the four direct neighbors count.\n`,
  );
}
