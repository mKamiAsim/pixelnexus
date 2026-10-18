// Figure and worked example for the matched vessel filter.
// gen-filter-docs.mjs calls vesselDocs with its helpers. Every number comes from the filter code.

export function vesselDocs(h) {
  const { run, pic, figure, example, mdTable, fix, vesselKernel } = h;
  // Dark lines with a Gaussian profile of sigma 1.5 on a light background: a circle, a wave and a
  // diagonal.
  const size = 120;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distances = [
        Math.abs(Math.hypot(x - 40, y - 40) - 25),
        Math.abs(y - (90 + 12 * Math.sin(x / 12))),
        Math.abs(x - y - 20) / Math.SQRT2,
      ];
      const depth = Math.max(...distances.map((d) => Math.exp(-(d * d) / (2 * 1.5 * 1.5))));
      const v = Math.round(180 - 60 * depth);
      data.set([v, v, v, 255], (y * size + x) * 4);
    }
  }
  const lines = run({ width: size, height: size, data }, "noise-gaussian", {
    sigma: 12,
    seed: 4,
    monochrome: true,
  });
  const vessel = (output) =>
    pic(
      run(lines, "matched-vessel", {
        sigma: 1.5,
        length: 9,
        output,
        outputMapping: "normalize",
        channelScope: "luminance",
      }),
    );
  figure("matched-vessel", {
    message:
      "Noisy dark lines with a Gaussian profile, the largest matched filter response with sigma 1.5 and length 9, and the direction of the best match.",
    panels: [
      { title: "Noisy lines", image: pic(lines) },
      { title: "Response", image: vessel("response") },
      { title: "Direction", image: vessel("angle") },
    ],
  });

  const kernel = vesselKernel(1, 5, 0, false);
  const r = kernel.anchorX;
  const us = [-3, -2, -1, 0, 1, 2, 3];
  const profile = us.map((u) => -Math.exp(-(u * u) / 2));
  const mean = profile.reduce((a, b) => a + b, 0) / profile.length;
  example(
    "matched-vessel",
    mdTable(
      ["u", ...us.map(String)],
      [
        ["-exp(-u^2 / 2)", ...profile.map((v) => fix(v, 4))],
        ["Kernel weight", ...us.map((u) => fix(kernel.weights[(r + u) * kernel.width + r], 4))],
      ],
    ) +
      `\nThe kernel for a horizontal vessel with sigma 1 and length 5. Across the vessel, u runs over the rows from -3 to 3, the window of 3 sigma. Along it, v runs over the columns from -2 to 2, since |v| must stay within 2.5. Every column of the window has the same profile, so the mean of the window is the mean of one column, ${fix(mean, 4)}. Each weight is the profile minus this mean. The weights add up to 0, so a flat area gives 0 and a dark line along the middle row gives a large positive response. The square that holds every direction of the kernel is ${kernel.width} x ${kernel.height}.\n`,
  );
}
