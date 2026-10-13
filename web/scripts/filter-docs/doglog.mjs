// Figures and worked examples for the Difference of Gaussians and the Laplacian of Gaussian.
// gen-filter-docs.mjs calls dogLogDocs with its helpers. Every number comes from the filter code.

export function dogLogDocs(h) {
  const { run, pic, row, figure, example, fix, synthetic, mdTable, gaussianSecondDerivative } = h;
  const disks = synthetic.disks(96, 96);
  const lum = (id, params) =>
    run(disks, id, { channelScope: "luminance", outputMapping: "offset", ...params });
  figure("dog", {
    message:
      "A small sigma keeps the small dots and thin edges. A large sigma responds to the large disks.",
    panels: [
      { title: "Disks", image: pic(disks) },
      { title: "DoG, sigma 1", image: pic(lum("dog", { sigma: 1 })) },
      { title: "DoG, sigma 4", image: pic(lum("dog", { sigma: 4 })) },
    ],
  });
  const kernel = Array.from(gaussianSecondDerivative(2));
  figure("log", {
    message:
      "The 1D second derivative of a Gaussian with sigma 2: negative in the middle, positive on both sides.",
    profile: {
      smooth: true,
      x: kernel.map((_, i) => i - (kernel.length - 1) / 2),
      xlabel: "Offset (pixels)",
      ylabel: "Weight",
      lines: [{ label: "Second derivative, sigma 2", values: kernel }],
    },
  });
  const edge = synthetic.stepEdge(64, 8);
  const values = (id, params) => row(run(edge, id, { ...params, outputMapping: "offset" }), 4);
  const dog = values("dog", { sigma: 1.5 });
  const log = values("log", { sigma: 1.5 });
  const xs = [28, 30, 31, 32, 33, 35];
  example(
    "dog",
    mdTable(
      ["x", ...xs.map(String)],
      [
        ["Input", ...xs.map((x) => String(row(edge, 4)[x]))],
        ["DoG + 128", ...xs.map((x) => String(dog[x]))],
      ],
    ) +
      `\nSigma 1.5 and ratio 1.6 on a step edge, shown with the offset mapping, so 128 means 0. The result dips below 128 on the dark side and rises above it on the bright side, and it is 128 far from the edge.\n`,
  );
  example(
    "log",
    mdTable(
      ["x", ...xs.map(String)],
      [
        ["Input", ...xs.map((x) => String(row(edge, 4)[x]))],
        ["LoG + 128", ...xs.map((x) => String(log[x]))],
      ],
    ) +
      `\nSigma 1.5 on the same step edge, with the offset mapping. The LoG is positive on the dark side and negative on the bright side, and it crosses 0 at the edge. The Marr-Hildreth detector marks such zero crossings. The center weight of the 1D second derivative kernel for sigma 2 is ${fix(kernel[(kernel.length - 1) / 2], 5)}.\n`,
  );
}
