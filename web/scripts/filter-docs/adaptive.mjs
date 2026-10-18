// Figures and worked examples for the Phase 5b adaptive filters and local statistics.
// gen-filter-docs.mjs calls adaptiveDocs with its helpers. Every number comes from the filter code.

export function adaptiveDocs(h) {
  const { run, pic, row, figure, example, planeAt, matrix, block, mdTable, fix, synthetic } = h;
  const { createImage, savgolCoefficients } = h;

  const patches = synthetic.noisePatches(96, 96);
  const disks = synthetic.disks(96, 96);
  const board = synthetic.checkerboard(96, 96, 12);
  const stat = (image, id, params = {}) =>
    run(image, id, { size: 5, channelScope: "luminance", ...params });

  figure("local-variance", {
    message:
      "The variance is 0 in the clean quadrant, and highest where salt and pepper make large jumps.",
    panels: [
      { title: "Noise patches", image: pic(patches) },
      { title: "Variance 5x5, stretched", image: pic(stat(patches, "local-variance")) },
    ],
  });
  figure("local-std", {
    message: "The standard deviation is near 0 inside the disks and high on their edges.",
    panels: [
      { title: "Disks", image: pic(disks) },
      { title: "Standard deviation 5x5", image: pic(stat(disks, "local-std")) },
    ],
  });
  figure("local-range", {
    message: "The range reacts to every single noisy pixel, so the noisy quadrants turn bright.",
    panels: [
      { title: "Noise patches", image: pic(patches) },
      { title: "Range 5x5", image: pic(stat(patches, "local-range")) },
    ],
  });
  figure("local-entropy", {
    message:
      "The checkerboard has a high variance but a low entropy, because it has only two values. Noise has a high entropy.",
    panels: [
      { title: "Checkerboard", image: pic(board) },
      { title: "Entropy 5x5", image: pic(stat(board, "local-entropy")) },
      { title: "Noise patches", image: pic(patches) },
      { title: "Entropy 5x5", image: pic(stat(patches, "local-entropy")) },
    ],
  });

  // A row of narrow and wide peaks with a little noise, for the Savitzky-Golay profile.
  const peaks = createImage(80, 9);
  for (let x = 0; x < 80; x++) {
    const v =
      40 +
      170 * Math.exp(-((x - 22) ** 2) / (2 * 1.6 ** 2)) +
      120 * Math.exp(-((x - 55) ** 2) / (2 * 5 ** 2)) +
      8 * Math.sin(x * 2.3);
    for (let y = 0; y < 9; y++) peaks.data.set([v, v, v, 255].map(Math.round), (y * 80 + x) * 4);
  }
  figure("savgol", {
    message:
      "With the same size, the Savitzky-Golay filter keeps the height of the narrow peak. The box filter flattens it.",
    profile: {
      x: Array.from({ length: 80 }, (_, i) => i),
      xlabel: "x (pixels)",
      ylabel: "Value",
      lines: [
        { label: "Input", values: row(peaks, 4) },
        { label: "Box, size 7", values: row(run(peaks, "box", { size: 7 }), 4) },
        {
          label: "Savitzky-Golay, size 7, degree 2",
          values: row(run(peaks, "savgol", { size: 7, order: 2 }), 4),
        },
      ],
    },
  });

  const noisy15 = run(disks, "noise-gaussian", { sigma: 15, seed: 31 });
  figure("wiener-adaptive", {
    message:
      "The adaptive Wiener filter smooths the flat areas and leaves the disk edges sharp. The box filter blurs both.",
    panels: [
      { title: "Noise, sigma 15", image: pic(noisy15) },
      {
        title: "Adaptive Wiener 5x5",
        image: pic(run(noisy15, "wiener-adaptive", { size: 5, noise: 15 })),
      },
      { title: "Box 5x5", image: pic(run(noisy15, "box", { size: 5 })) },
    ],
  });
  const noisy20 = run(disks, "noise-gaussian", { sigma: 20, seed: 32 });
  figure("adaptive-local-noise", {
    message:
      "With the noise level known, the adaptive filter keeps the edges that a 7x7 mean blurs.",
    panels: [
      { title: "Noise, sigma 20", image: pic(noisy20) },
      {
        title: "Adaptive 7x7",
        image: pic(run(noisy20, "adaptive-local-noise", { size: 7, noise: 20 })),
      },
      { title: "Box 7x7", image: pic(run(noisy20, "box", { size: 7 })) },
    ],
  });
  const edge = run(synthetic.stepEdge(64, 16), "noise-gaussian", { sigma: 10, seed: 33 });
  const xs = Array.from({ length: 41 }, (_, i) => i + 12);
  const slice = (image) => row(image, 8).slice(12, 53);
  figure("sigma", {
    message:
      "The sigma filter averages only values within 2 sigma, so the step stays sharp. The box filter turns it into a slope.",
    profile: {
      x: xs,
      xlabel: "x (pixels)",
      ylabel: "Value",
      lines: [
        { label: "Noisy edge", values: slice(edge) },
        { label: "Box 5x5", values: slice(run(edge, "box", { size: 5 })) },
        {
          label: "Sigma, 5x5, sigma 10",
          values: slice(run(edge, "sigma", { size: 5, sigma: 10 })),
        },
      ],
    },
  });
  figure("adaptive-smoothing", {
    message: "More steps flatten the noise inside the disks. The edges stay where they are.",
    panels: [
      { title: "Noise, sigma 15", image: pic(noisy15) },
      {
        title: "5 steps, k 10",
        image: pic(run(noisy15, "adaptive-smoothing", { iterations: 5, k: 10 })),
      },
      {
        title: "20 steps, k 10",
        image: pic(run(noisy15, "adaptive-smoothing", { iterations: 20, k: 10 })),
      },
    ],
  });

  // Worked examples ------------------------------------------------------------------------

  const W = [
    [52, 61, 58],
    [49, 70, 63],
    [55, 66, 60],
  ];
  const v = W.flat();
  const mean = v.reduce((a, b) => a + b, 0) / 9;
  const meanSq = v.reduce((a, b) => a + b * b, 0) / 9;
  const variance = meanSq - mean * mean;
  example(
    "local-variance",
    block(`W = ${matrix(W)}`) +
      `\nThe mean is ${fix(mean, 4)} and the mean of the squares is ${fix(meanSq, 4)}. The variance is ${fix(meanSq, 4)} - ${fix(mean, 4)}^2 = **${fix(planeAt("local-variance", W, { size: 3 }, 1, 1), 3)}** squared levels.\n`,
  );
  example(
    "local-std",
    block(`W = ${matrix(W)}`) +
      `\nThe variance of the window is ${fix(variance, 3)}, so the standard deviation is its square root, **${fix(planeAt("local-std", W, { size: 3 }, 1, 1), 3)}** levels. The values spread about ${fix(Math.sqrt(variance), 0)} levels around their mean of ${fix(mean, 2)}.\n`,
  );
  example(
    "local-range",
    block(`W = ${matrix(W)}`) +
      `\nThe largest value is ${Math.max(...v)} and the smallest ${Math.min(...v)}, so the range is **${fix(planeAt("local-range", W, { size: 3 }, 1, 1), 0)}**.\n`,
  );
  const E = [
    [30, 30, 220],
    [30, 30, 220],
    [30, 120, 220],
  ];
  example(
    "local-entropy",
    block(`W = ${matrix(E)}`) +
      `\n` +
      mdTable(
        ["Value", "Count", "Share p", "-p log2 p"],
        [
          [30, 5],
          [120, 1],
          [220, 3],
        ].map(([value, count]) => {
          const p = count / 9;
          return [String(value), String(count), fix(p, 4), fix(-p * Math.log2(p), 4)];
        }),
      ) +
      `\nThe entropy is the sum, **${fix(planeAt("local-entropy", E, { size: 3 }, 1, 1), 4)}** bits. A flat window has 0 bits, and a window of 9 different values has log2 9 = ${fix(Math.log2(9), 4)} bits.\n`,
  );

  const c5 = savgolCoefficients(5, 2);
  example(
    "savgol",
    `For a window of 5 values and degree 2, the weights from the code are:\n\n` +
      block(
        `c = ${matrix([c5], 5)} = \\frac{1}{35}${matrix([c5.map((x) => Math.round(x * 35))], 0)}`,
      ) +
      `\nThese are the classic weights from the 1964 paper. They add up to 1, and the two outer weights are negative. The negative weights let the fit follow a peak instead of flattening it. For the row 40, 60, 200, 60, 40 the filter gives (-3 x 40 + 12 x 60 + 17 x 200 + 12 x 60 - 3 x 40) / 35 = ${fix((-3 * 40 + 12 * 60 + 17 * 200 + 12 * 60 - 3 * 40) / 35, 2)}. A box filter of the same size gives 80.\n`,
  );

  const N = [
    [52, 61, 58],
    [49, 90, 63],
    [55, 66, 60],
  ];
  const nv = N.flat();
  const nm = nv.reduce((a, b) => a + b, 0) / 9;
  const ns = nv.reduce((a, b) => a + b * b, 0) / 9 - nm * nm;
  const noise = 10;
  const gain = Math.max(0, ns - noise ** 2) / Math.max(ns, noise ** 2);
  example(
    "wiener-adaptive",
    block(`W = ${matrix(N)}`) +
      `\nThe mean is m = ${fix(nm, 3)} and the variance s^2 = ${fix(ns, 3)}. With noise sigma ${noise}, the noise variance is ${noise ** 2}. The gain is (${fix(ns, 3)} - ${noise ** 2}) / ${fix(ns, 3)} = ${fix(gain, 4)}. The output is ${fix(nm, 3)} + ${fix(gain, 4)} x (90 - ${fix(nm, 3)}) = **${fix(planeAt("wiener-adaptive", N, { size: 3, noise }, 1, 1), 3)}**. The bright center is pulled about ${fix((1 - gain) * 100, 0)} percent of the way to the mean.\n`,
  );
  const ratio = Math.min(1, noise ** 2 / ns);
  example(
    "adaptive-local-noise",
    block(`W = ${matrix(N)}`) +
      `\nThe local mean is m_L = ${fix(nm, 3)} and the local variance sigma_L^2 = ${fix(ns, 3)}. With sigma_eta = ${noise}, the ratio is ${noise ** 2} / ${fix(ns, 3)} = ${fix(ratio, 4)}. The output is 90 - ${fix(ratio, 4)} x (90 - ${fix(nm, 3)}) = **${fix(planeAt("adaptive-local-noise", N, { size: 3, noise }, 1, 1), 3)}**, the same as the adaptive Wiener filter gives.\n`,
  );

  const S = [
    [40, 42, 39, 200, 202],
    [41, 38, 40, 198, 201],
    [39, 43, 41, 203, 199],
    [42, 40, 38, 200, 200],
    [40, 41, 42, 201, 198],
  ];
  const z = 41;
  const used = S.flat().filter((w) => Math.abs(w - z) <= 20);
  example(
    "sigma",
    block(`W = ${matrix(S)}`) +
      `\nThe center is z = ${z}. With sigma 10 and k = 2, the range is ${z - 20} to ${z + 20}. The ${used.length} dark values are in range, the ${25 - used.length} bright ones are not. Their mean is **${fix(planeAt("sigma", S, { size: 5, sigma: 10, k: 2, minCount: 3 }, 2, 2), 3)}**. A 5x5 box filter would give ${fix(S.flat().reduce((a, b) => a + b, 0) / 25, 2)}, pulled toward the bright side.\n`,
  );

  const A = [
    [50, 50, 50, 200, 200],
    [50, 52, 48, 200, 200],
    [50, 49, 51, 200, 200],
    [50, 50, 50, 200, 200],
    [50, 50, 50, 200, 200],
  ];
  const at = (x, y) => A[Math.min(4, Math.max(0, y))][Math.min(4, Math.max(0, x))];
  const weight = (x, y) => {
    const gx = (at(x + 1, y) - at(x - 1, y)) / 2;
    const gy = (at(x, y + 1) - at(x, y - 1)) / 2;
    return Math.exp(-(gx * gx + gy * gy) / (2 * 10 * 10));
  };
  const weights = [1, 2, 3].map((y) => [1, 2, 3].map((x) => weight(x, y)));
  example(
    "adaptive-smoothing",
    block(`W = ${matrix(A)}`) +
      `\nOne step for the center pixel, value ${A[2][2]}, with k = 10. The weights of its 3x3 window come from each pixel's own gradient:\n\n` +
      block(`w = ${matrix(weights, 4)}`) +
      `\nThe middle and right columns touch the edge. Their central differences reach across it, about 75 per pixel, so their weights are almost 0. Only the left column counts, and the output is the weighted mean, **${fix(planeAt("adaptive-smoothing", A, { iterations: 1, k: 10 }, 2, 2), 3)}**, a dark value.\n`,
  );
}
