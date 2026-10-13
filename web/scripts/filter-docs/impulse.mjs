// Figures and worked examples for the Phase 5b impulse noise filters.
// gen-filter-docs.mjs calls impulseDocs with its helpers. Every number comes from the filter code.

export function impulseDocs(h) {
  const {
    run,
    pic,
    figure,
    example,
    planeAt,
    matrix,
    block,
    mdTable,
    fix,
    synthetic,
    browserFilter,
  } = h;

  const scene = synthetic.disks(96, 96);
  const dense = run(scene, "noise-salt-pepper", { amount: 0.3, seed: 11 });
  figure("adaptive-median", {
    message:
      "With 30 percent noise, a 3x3 median leaves specks and a 7x7 median blurs. The adaptive median does neither.",
    panels: [
      { title: "30 percent noise", image: pic(dense) },
      { title: "Median 3x3", image: pic(run(dense, "median", { size: 3 })) },
      { title: "Median 7x7", image: pic(run(dense, "median", { size: 7 })) },
      { title: "Adaptive, up to 7", image: pic(run(dense, "adaptive-median", { maxSize: 7 })) },
    ],
  });

  const star = run(synthetic.siemensStar(96, 96, 24), "noise-salt-pepper", {
    amount: 0.05,
    seed: 12,
  });
  figure("switching-median", {
    message:
      "The switching median repairs the specks and keeps the spokes, because it changes only pixels far from the median.",
    panels: [
      { title: "5 percent noise", image: pic(star) },
      { title: "Median 3x3", image: pic(run(star, "median", { size: 3 })) },
      {
        title: "Switching, T = 40",
        image: pic(run(star, "switching-median", { size: 3, threshold: 40 })),
      },
    ],
  });

  const hues = run(synthetic.hueSweep(96, 48), "noise-salt-pepper", { amount: 0.06, seed: 13 });
  figure("vector-median", {
    message: "Both remove the specks. The vector median uses only colors from the window.",
    panels: [
      { title: "Color image with specks", image: pic(hues, true) },
      { title: "Median 3x3, per channel", image: pic(run(hues, "median", { size: 3 }), true) },
      { title: "Vector median 3x3", image: pic(run(hues, "vector-median", { size: 3 }), true) },
    ],
  });

  const sparse = run(scene, "noise-salt-pepper", { amount: 0.01, seed: 14 });
  figure("dead-pixel", {
    message: "The detection view shows the defective pixels. The repair changes only those pixels.",
    panels: [
      { title: "1 percent defects", image: pic(sparse) },
      {
        title: "Detected pixels",
        image: pic(run(sparse, "dead-pixel", { threshold: 50, output: "mask" })),
      },
      { title: "Repaired", image: pic(run(sparse, "dead-pixel", { threshold: 50 })) },
    ],
  });

  const grainy = run(run(scene, "noise-gaussian", { sigma: 12, seed: 15 }), "noise-salt-pepper", {
    amount: 0.03,
    seed: 16,
  });
  figure("mad-outlier", {
    message:
      "With t = 3, the specks are outliers but the Gaussian grain is not, because the MAD measures it.",
    panels: [
      { title: "Grain and specks", image: pic(grainy) },
      {
        title: "Outliers, t = 3",
        image: pic(run(grainy, "mad-outlier", { size: 5, t: 3, output: "mark" })),
      },
      { title: "Repaired", image: pic(run(grainy, "mad-outlier", { size: 5, t: 3 })) },
    ],
  });

  // Worked examples ------------------------------------------------------------------------

  const A = [
    [100, 104, 110, 98, 102],
    [106, 255, 0, 255, 99],
    [101, 0, 255, 0, 105],
    [97, 255, 0, 255, 103],
    [108, 96, 107, 100, 109],
  ];
  const inner = A.slice(1, 4).flatMap((r) => r.slice(1, 4));
  const sortedInner = [...inner].sort((a, b) => a - b);
  const all = [...A.flat()].sort((a, b) => a - b);
  example(
    "adaptive-median",
    block(`W_5 = ${matrix(A)}`) +
      `\nThe center pixel is 255. Its 3x3 window holds only impulses: ${sortedInner.join(", ")}. There z_min = 0, z_med = ${sortedInner[4]} and z_max = 255, so the median is an impulse too and stage A grows the window.\n\nIn the 5x5 window, z_min = ${all[0]}, z_med = ${all[12]} and z_max = ${all[24]}. Now z_min < z_med < z_max, so stage B runs. The pixel 255 is not strictly below z_max, so it is an impulse and the output is the median, **${fix(planeAt("adaptive-median", A, { maxSize: 5 }, 2, 2), 0)}**. A plain 3x3 median would give ${fix(planeAt("median", A, { size: 3 }, 2, 2), 0)} here.\n`,
  );

  const S = [
    [62, 58, 61],
    [57, 200, 60],
    [59, 63, 56],
  ];
  const D = [
    [62, 58, 61],
    [57, 90, 60],
    [59, 63, 56],
  ];
  example(
    "switching-median",
    mdTable(
      ["Window center", "Median m", "Difference", "T", "Output"],
      [
        [
          "200",
          "60",
          "140",
          "40",
          fix(planeAt("switching-median", S, { size: 3, threshold: 40 }, 1, 1), 0),
        ],
        [
          "90",
          "60",
          "30",
          "40",
          fix(planeAt("switching-median", D, { size: 3, threshold: 40 }, 1, 1), 0),
        ],
      ],
    ) +
      `\nBoth windows have the same 8 neighbors, ${[62, 58, 61, 57, 60, 59, 63, 56].join(", ")}. With 200 in the center, the sorted window is 56, 57, 58, 59, 60, 61, 62, 63, 200 and the median is 60. The difference 140 is above T = 40, so the pixel is replaced. With 90 in the center the median is again 60, but the difference 30 is below T, so the pixel keeps its value.\n`,
  );

  const colorAt = (id, colors, params) => {
    const n = Math.sqrt(colors.length);
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
  const V = [
    [200, 40, 40],
    [210, 50, 40],
    [190, 40, 50],
    [205, 45, 45],
    [255, 255, 255],
    [40, 200, 40],
    [195, 45, 40],
    [50, 210, 45],
    [200, 50, 50],
  ];
  const sums = V.map((v) =>
    V.reduce((s, w) => s + Math.hypot(v[0] - w[0], v[1] - w[1], v[2] - w[2]), 0),
  );
  const vm = colorAt("vector-median", V, { size: 3, norm: "l2" });
  const med = [0, 1, 2].map((c) => [...V.map((v) => v[c])].sort((a, b) => a - b)[4]);
  example(
    "vector-median",
    mdTable(
      ["Position", "Color (R, G, B)", "Sum of L2 distances"],
      V.map((v, i) => [String(i + 1), `(${v.join(", ")})`, fix(sums[i], 1)]),
    ) +
      `\nA 3x3 window on a red area, with a white speck in the center and two green pixels. The smallest sum belongs to (${vm.map((v) => fix(v, 0)).join(", ")}), so that is the output. The per-channel median gives (${med.join(", ")}), a color that is in none of the nine pixels.\n`,
  );

  const R = [
    [120, 122, 119],
    [121, 250, 118],
    [123, 120, 122],
  ];
  const G = [
    [80, 82, 79],
    [81, 84, 78],
    [83, 80, 82],
  ];
  const ringR = [120, 122, 119, 121, 118, 123, 120, 122].sort((a, b) => a - b);
  const colors = R.flat().map((r, i) => [r, G.flat()[i], 60]);
  const repaired = colorAt("dead-pixel", colors, { size: 3, threshold: 50 });
  example(
    "dead-pixel",
    block(`R = ${matrix(R)}, \\qquad G = ${matrix(G)}, \\qquad B = 60 \\text{ everywhere}`) +
      `\nA hot pixel in the red channel. The 8 red neighbors, sorted, are ${ringR.join(", ")}. Their median is (${ringR[3]} + ${ringR[4]}) / 2 = ${fix((ringR[3] + ringR[4]) / 2, 1)}. The red difference is ${fix(250 - (ringR[3] + ringR[4]) / 2, 1)}, above T = 50, so the pixel is defective. All three channels get their neighbor medians, and the result is (${repaired.map((v) => fix(v, 1)).join(", ")}). The green value 84 was close to its neighbors, but it is replaced too, because the whole pixel is taken as faulty.\n`,
  );

  const M = [
    [50, 54, 49],
    [52, 120, 51],
    [48, 55, 53],
  ];
  const mVals = M.flat();
  const m = [...mVals].sort((a, b) => a - b)[4];
  const dist = mVals.map((v) => Math.abs(v - m)).sort((a, b) => a - b);
  const mad = dist[4];
  const scaled = 1.482602218505602 * mad;
  const gray = mVals.map((v) => [v, v, v]);
  const fixed = colorAt("mad-outlier", gray, { size: 3, t: 3 });
  example(
    "mad-outlier",
    block(`W = ${matrix(M)}`) +
      `\nThe median is m = ${m}. The distances to it, sorted, are ${dist.join(", ")}, so the MAD is ${mad} and S = 1.4826 x ${mad} = ${fix(scaled, 3)}. With t = 3 the limit is ${fix(3 * scaled, 2)}. The center is ${120 - m} away from m, above the limit, so it is an outlier and becomes **${fix(fixed[0], 0)}**. The value 55 is ${55 - m} away, below the limit, so it would stay.\n`,
  );
}
