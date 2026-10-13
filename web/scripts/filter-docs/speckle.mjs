// Figures and worked examples for the Phase 5b speckle filters and noise generators.
// gen-filter-docs.mjs calls speckleDocs with its helpers. Every number comes from the filter code.

export function speckleDocs(h) {
  const { run, pic, row, figure, example, planeAt, matrix, block, mdTable, fix, synthetic } = h;
  const { cMax, leeWeight, kuanWeight } = h;

  const disks = synthetic.disks(96, 96);
  const speckled = run(disks, "noise-speckle", { sigma: 0.25, monochrome: true, seed: 41 });
  figure("lee", {
    message:
      "The Lee filter smooths the speckle in flat areas and keeps the disk edges. The box filter blurs them.",
    panels: [
      { title: "Speckle, sigma 0.25", image: pic(speckled) },
      { title: "Lee 7x7", image: pic(run(speckled, "lee", { size: 7, cu: 0.25 })) },
      { title: "Box 7x7", image: pic(run(speckled, "box", { size: 7 })) },
    ],
  });
  const edge = run(synthetic.stepEdge(64, 16), "noise-speckle", {
    sigma: 0.25,
    monochrome: true,
    seed: 42,
  });
  const xs = Array.from({ length: 41 }, (_, i) => i + 12);
  const slice = (image) => row(image, 8).slice(12, 53);
  figure("kuan", {
    message:
      "The Kuan weight is a little smaller than the Lee weight, so it smooths a little more everywhere.",
    profile: {
      x: xs,
      xlabel: "x (pixels)",
      ylabel: "Value",
      lines: [
        { label: "Speckled edge", values: slice(edge) },
        { label: "Lee 7x7", values: slice(run(edge, "lee", { size: 7, cu: 0.25 })) },
        { label: "Kuan 7x7", values: slice(run(edge, "kuan", { size: 7, cu: 0.25 })) },
      ],
    },
  });
  figure("enhanced-lee", {
    message: "The enhanced Lee filter smooths flat areas fully and keeps the small bright dots.",
    panels: [
      { title: "Speckle", image: pic(speckled) },
      { title: "Lee 7x7", image: pic(run(speckled, "lee", { size: 7, cu: 0.25 })) },
      {
        title: "Enhanced Lee 7x7",
        image: pic(run(speckled, "enhanced-lee", { size: 7, cu: 0.25 })),
      },
    ],
  });
  figure("frost", {
    message:
      "A small damping smooths strongly. A larger damping keeps more of the edges and the speckle.",
    panels: [
      { title: "Speckle", image: pic(speckled) },
      { title: "Frost, K = 1", image: pic(run(speckled, "frost", { size: 7, damping: 1 })) },
      { title: "Frost, K = 5", image: pic(run(speckled, "frost", { size: 7, damping: 5 })) },
    ],
  });
  figure("gamma-map", {
    message: "Gamma-MAP smooths flat areas like the enhanced Lee filter and keeps the edges.",
    panels: [
      { title: "Speckle", image: pic(speckled) },
      { title: "Lee 7x7", image: pic(run(speckled, "lee", { size: 7, cu: 0.25 })) },
      { title: "Gamma-MAP 7x7", image: pic(run(speckled, "gamma-map", { size: 7, cu: 0.25 })) },
    ],
  });
  figure("srad", {
    message:
      "SRAD removes the speckle in both the dark background and the bright disks, and keeps the edges sharp.",
    panels: [
      { title: "Speckle", image: pic(speckled) },
      {
        title: "SRAD, 30 steps",
        image: pic(run(speckled, "srad", { iterations: 30, dt: 0.1, q0: 0.25 })),
      },
      {
        title: "Anisotropic diffusion",
        image: pic(run(speckled, "anisotropic-diffusion", { iterations: 30, kappa: 20 })),
      },
    ],
  });
  const ramp = synthetic.ramp(128, 16);
  const rampX = Array.from({ length: 128 }, (_, i) => i);
  figure("noise-speckle", {
    message:
      "Speckle grows with the brightness: the dark end is almost clean, the bright end very noisy.",
    profile: {
      x: rampX,
      xlabel: "x (pixels)",
      ylabel: "Value",
      lines: [
        { label: "Gray ramp", values: row(ramp, 8) },
        {
          label: "With speckle, sigma 0.2",
          values: row(run(ramp, "noise-speckle", { sigma: 0.2, monochrome: true, seed: 43 }), 8),
        },
      ],
    },
  });
  figure("noise-poisson", {
    message:
      "Fewer photons give more noise. The noise grows with the square root of the brightness.",
    profile: {
      x: rampX,
      xlabel: "x (pixels)",
      ylabel: "Value",
      lines: [
        { label: "Gray ramp", values: row(ramp, 8) },
        {
          label: "20 photons at white",
          values: row(run(ramp, "noise-poisson", { peak: 20, seed: 44 }), 8),
        },
        {
          label: "200 photons at white",
          values: row(run(ramp, "noise-poisson", { peak: 200, seed: 45 }), 8),
        },
      ],
    },
  });

  // Worked examples ------------------------------------------------------------------------

  const W = [
    [96, 121, 104, 88, 112],
    [108, 93, 131, 99, 101],
    [85, 117, 150, 106, 94],
    [110, 102, 90, 124, 97],
    [99, 114, 105, 92, 118],
  ];
  const v = W.flat();
  const m = v.reduce((a, b) => a + b, 0) / 25;
  const sd = Math.sqrt(v.reduce((a, b) => a + b * b, 0) / 25 - m * m);
  const ci = sd / m;
  const cu = 0.1;
  const window = block(`W = ${matrix(W)}`);
  const stats = `The window mean is m = ${fix(m, 2)} and its standard deviation ${fix(sd, 3)}, so C_I = ${fix(sd, 3)} / ${fix(m, 2)} = ${fix(ci, 4)}. With C_u = ${cu}`;
  example(
    "lee",
    window +
      `\n${stats}, the weight is W = 1 - ${cu}^2 / ${fix(ci, 4)}^2 = ${fix(leeWeight(ci, cu), 4)}. The output for the center 150 is ${fix(m, 2)} + ${fix(leeWeight(ci, cu), 4)} x (150 - ${fix(m, 2)}) = **${fix(planeAt("lee", W, { size: 5, cu }, 2, 2), 3)}**.\n`,
  );
  example(
    "kuan",
    window +
      `\n${stats}, the Lee weight is ${fix(leeWeight(ci, cu), 4)}, and the Kuan weight is that divided by 1 + ${cu}^2, ${fix(kuanWeight(ci, cu), 4)}. The output for the center 150 is **${fix(planeAt("kuan", W, { size: 5, cu }, 2, 2), 3)}**, a little closer to the mean than the Lee filter gives.\n`,
  );
  const max = cMax(cu);
  example(
    "enhanced-lee",
    window +
      `\n${stats}, C_max = sqrt(1 + 2 x ${cu}^2) = ${fix(max, 4)}. C_I lies between C_u and C_max, so the pixel is in the middle class. With K = 1, W = exp(-(${fix(ci, 4)} - ${cu}) / (${fix(max, 4)} - ${fix(ci, 4)})) = ${fix(Math.exp(-(ci - cu) / (max - ci)), 4)}. The output is m W + z (1 - W) = **${fix(planeAt("enhanced-lee", W, { size: 5, cu, damping: 1 }, 2, 2), 3)}**.\n`,
  );
  const b = 1 * ci * ci;
  example(
    "frost",
    window +
      `\nC_I = ${fix(ci, 4)}, so with K = 1 the weights are exp(-${fix(b, 5)} d):\n\n` +
      mdTable(
        ["Distance d", "0", "1", "1.414", "2", "2.828"],
        [["Weight", ...[0, 1, Math.SQRT2, 2, 2 * Math.SQRT2].map((d) => fix(Math.exp(-b * d), 5))]],
      ) +
      `\nThe local variation is small, so the weights barely fall, and the output is close to the window mean: **${fix(planeAt("frost", W, { size: 5, damping: 1 }, 2, 2), 3)}**. In a window with a strong edge, C_I would be several times larger and the weights would fall much faster.\n`,
  );
  const looks = 1 / (cu * cu);
  const alpha = (1 + cu * cu) / (ci * ci - cu * cu);
  example(
    "gamma-map",
    window +
      `\n${stats}, the number of looks is L = 1 / ${cu}^2 = ${fix(looks, 0)} and alpha = (1 + ${cu}^2) / (${fix(ci, 4)}^2 - ${cu}^2) = ${fix(alpha, 3)}. C_I lies between C_u and C_max = ${fix(max, 4)}, so the MAP formula applies. Its value for the center 150 is **${fix(planeAt("gamma-map", W, { size: 5, cu }, 2, 2), 3)}**.\n`,
  );

  const S = [
    [100, 104, 98],
    [102, 120, 99],
    [101, 97, 103],
  ];
  const z = 120;
  const d = [104 - z, 97 - z, 102 - z, 99 - z];
  const g2 = d.reduce((a, x) => a + x * x, 0) / (z * z);
  const lap = d.reduce((a, x) => a + x, 0) / z;
  const q2 = (0.5 * g2 - (lap * lap) / 16) / (1 + lap / 4) ** 2;
  const q0 = 0.25;
  const c = Math.min(1, Math.max(0, 1 / (1 + (q2 - q0 * q0) / (q0 * q0 * (1 + q0 * q0)))));
  example(
    "srad",
    block(`W = ${matrix(S)}`) +
      `\nFor the center 120, the differences to the north, south, west and east neighbors are ${d.join(", ")}. The sum of their squares over 120 squared is ${fix(g2, 5)}, and their sum over 120 is ${fix(lap, 5)}. That gives q^2 = ${fix(q2, 5)}. With q0 = ${q0}, q0^2 = ${q0 * q0}, so q is below the speckle scale and the coefficient is c = ${fix(c, 4)}, limited to 1. The center diffuses freely. One step with dt = 0.1 gives **${fix(planeAt("srad", S, { iterations: 1, dt: 0.1, q0, rho: 0 }, 1, 1), 3)}**.\n`,
  );

  example(
    "noise-speckle",
    mdTable(
      ["Value", "Noise sigma in levels", "With n = 1.5"],
      [50, 100, 200].map((value) => [
        String(value),
        fix(value * 0.2, 1),
        fix(value * (1 + 0.2 * 1.5), 1),
      ]),
    ) +
      `\nWith sigma = 0.2, the noise standard deviation is 0.2 times the value. A normal number n = 1.5 raises 50 by 15 but 200 by 60. Black, 0, stays black.\n`,
  );
  const peak = 50;
  example(
    "noise-poisson",
    mdTable(
      ["Value", "Mean photons", "Photon spread", "Noise in levels"],
      [10, 128, 255].map((value) => {
        const lambda = (value * peak) / 255;
        return [
          String(value),
          fix(lambda, 2),
          fix(Math.sqrt(lambda), 3),
          fix((Math.sqrt(lambda) * 255) / peak, 2),
        ];
      }),
    ) +
      `\nWith ${peak} photons at white, a value of 128 has a mean of ${fix((128 * peak) / 255, 2)} photons. A Poisson count has a standard deviation equal to the square root of its mean. Scaled back by 255 / ${peak}, that is the noise in levels. The bright value has more noise in levels, but less relative to its value.\n`,
  );
}
