// Figures and worked examples for white balance and chromatic adaptation.
// gen-filter-docs.mjs calls whiteBalanceDocs with its helpers. Every number comes from the code.

export function whiteBalanceDocs(h) {
  const { run, pic, figure, example, mdTable, fix, createImage, hsvToRgb } = h;
  const { neutralGains, ILLUMINANTS, planckianXy, adaptationMatrix, rgbAdaptation } = h;

  // The color chart of the color adjustments: hue across, value down, over a gray ramp.
  const chart = createImage(180, 90);
  for (let y = 0; y < 90; y++) {
    for (let x = 0; x < 180; x++) {
      const v = x * (255 / 179);
      const [r, g, b] = y < 60 ? hsvToRgb((360 * x) / 180, 0.6, 1 - (0.85 * y) / 59) : [v, v, v];
      chart.data.set([Math.round(r), Math.round(g), Math.round(b), 255], (y * 180 + x) * 4);
    }
  }
  // The chart as tungsten light would show it: adapted from D65 to illuminant A.
  const warm = run(chart, "chromatic-adaptation", { source: "D65", target: "A" });
  const color = (image) => pic(image, true);
  const at = (image, x, y) =>
    Array.from(image.data.slice((y * 180 + x) * 4, (y * 180 + x) * 4 + 3));
  const hex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  const triple = (v, d = 3) => `(${v.map((x) => fix(x, d)).join(", ")})`;

  const picked = at(warm, 128, 75);
  const neutral = hex(picked);
  figure("white-balance", {
    message: "The chart with a tungsten cast, and after white balance on a gray of the ramp.",
    panels: [
      { title: "Warm cast", image: color(warm) },
      { title: `Neutral ${neutral}`, image: color(run(warm, "white-balance", { neutral })) },
    ],
  });
  {
    const gains = neutralGains(picked, true);
    const out = run(warm, "white-balance", { neutral });
    example(
      "white-balance",
      mdTable(
        ["Quantity", "Value"],
        [
          ["Picked neutral, encoded", `(${picked.join(", ")}), ${neutral}`],
          ["Gains in linear light", triple(gains)],
          ["The same pixel after the filter", `(${at(out, 128, 75).join(", ")})`],
        ],
      ) +
        "\nThe neutral is the gray ramp at x = 128 in the warm chart of the figure. Its red is high and its blue low, so the gains lower red and raise blue. After the filter the pixel is gray, up to rounding.\n",
    );
  }

  const means = (image) => {
    const sums = [0, 0, 0];
    for (let i = 0; i < image.data.length; i += 4)
      for (let c = 0; c < 3; c++) sums[c] += image.data[i + c];
    return sums.map((s) => s / (image.width * image.height));
  };
  const grayWorld = run(warm, "gray-world", { linearLight: false });
  figure("gray-world", {
    message: "The chart with a tungsten cast, and after gray-world correction.",
    panels: [
      { title: "Warm cast", image: color(warm) },
      { title: "Gray world", image: color(run(warm, "gray-world", {})) },
    ],
  });
  example(
    "gray-world",
    mdTable(
      ["Image", "Mean red", "Mean green", "Mean blue"],
      [
        ["Warm cast", ...means(warm).map((m) => fix(m, 2))],
        ["Gray world, encoded values", ...means(grayWorld).map((m) => fix(m, 2))],
      ],
    ) +
      "\nWith Linear light off, the gains act on the encoded values, so the channel means become equal, up to rounding and clipping. With Linear light on, the default, the means of the linear values become equal instead.\n",
  );

  figure("white-patch", {
    message:
      "The chart with a tungsten cast, and after white-patch correction at percentiles 100 and 99.",
    panels: [
      { title: "Warm cast", image: color(warm) },
      { title: "Percentile 100", image: color(run(warm, "white-patch", { percentile: 100 })) },
      { title: "Percentile 99", image: color(run(warm, "white-patch", { percentile: 99 })) },
    ],
  });
  {
    const maxes = [0, 1, 2].map((c) => {
      let top = 0;
      for (let i = c; i < warm.data.length; i += 4) top = Math.max(top, warm.data[i]);
      return top;
    });
    example(
      "white-patch",
      mdTable(
        ["Channel", "Red", "Green", "Blue"],
        [
          ["Largest value in the warm chart", ...maxes.map(String)],
          ["Gain with percentile 100, encoded values", ...maxes.map((m) => fix(255 / m, 3))],
        ],
      ) +
        "\nIn the warm chart, red already reaches 255 while blue stops at 149. So red keeps gain 1 and blue gets the largest gain, which removes most of the yellow cast.\n",
    );
  }

  figure("chromatic-adaptation", {
    message:
      "The chart, adapted from D65 to illuminant A with Bradford, and adapted back from A to D65.",
    panels: [
      { title: "Chart", image: color(chart) },
      { title: "D65 to A", image: color(warm) },
      { title: "A to D65", image: color(run(warm, "chromatic-adaptation", {})) },
    ],
  });
  {
    const m = adaptationMatrix(ILLUMINANTS.A, ILLUMINANTS.D65, "bradford");
    const rgb = rgbAdaptation(ILLUMINANTS.A, ILLUMINANTS.D65, "bradford");
    const rows = (mat) =>
      mat.map((row) => row.map((v) => fix(v, 7)).join(", ")).map((r) => `(${r})`);
    example(
      "chromatic-adaptation",
      mdTable(
        ["Matrix", "Row 1", "Row 2", "Row 3"],
        [
          ["Bradford A to D65, XYZ", ...rows(m)],
          ["The same, linear sRGB", ...rows(rgb)],
        ],
      ) +
        "\nThe XYZ matrix matches the one Lindbloom tables for A to D65 with Bradford, 0.8446965, -0.1179225, 0.3948108 in its first row, to the seventh decimal. The filter applies the linear sRGB version. Its large blue gain in the third row undoes the yellow of tungsten light.\n",
    );
  }

  figure("temperature-tint", {
    message: "The chart with a tungsten cast, corrected with temperature 2850 K and with 4500 K.",
    panels: [
      { title: "Warm cast", image: color(warm) },
      { title: "2850 K", image: color(run(warm, "temperature-tint", { temperature: 2850 })) },
      { title: "4500 K", image: color(run(warm, "temperature-tint", { temperature: 4500 })) },
    ],
  });
  {
    const xyA = [ILLUMINANTS.A[0], ILLUMINANTS.A[1], ILLUMINANTS.A[2]];
    const s = xyA[0] + xyA[1] + xyA[2];
    const temps = [2000, 2856, 4500, 6500, 10000];
    example(
      "temperature-tint",
      mdTable(
        ["Temperature (K)", ...temps.map(String)],
        [
          ["x", ...temps.map((t) => fix(planckianXy(t)[0], 4))],
          ["y", ...temps.map((t) => fix(planckianXy(t)[1], 4))],
        ],
      ) +
        `\nThe blackbody chromaticity from the spline of Kang and colleagues. Illuminant A is defined as a blackbody at about 2856 K, and its white point gives x = ${fix(xyA[0] / s, 4)} and y = ${fix(xyA[1] / s, 4)}, close to the spline at 2856 K. That is why 2850 K nearly removes the cast in the figure, which was made by adapting D65 to A.\n`,
    );
  }
}
