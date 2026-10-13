// Figures and worked examples for the Phase 5b rank and mean filters.
// gen-filter-docs.mjs calls rankDocs with its helpers. Every number comes from the filter code.

export function rankDocs(h) {
  const { run, pic, figure, example, planeAt, matrix, block, mdTable, fix, synthetic } = h;

  const scene = synthetic.disks(96, 96);
  const salt = run(scene, "noise-salt-pepper", { amount: 0.08, salt: 1, seed: 3 });
  const pepper = run(scene, "noise-salt-pepper", { amount: 0.08, salt: 0, seed: 4 });
  const both = run(scene, "noise-salt-pepper", { amount: 0.08, seed: 5 });
  const gauss = run(scene, "noise-gaussian", { sigma: 20, seed: 6 });
  const mixed = run(gauss, "noise-salt-pepper", { amount: 0.05, seed: 7 });

  figure("min", {
    message:
      "The min filter removes white specks. The median also removes them but keeps small bright dots.",
    panels: [
      { title: "Salt noise", image: pic(salt) },
      { title: "Min 3x3", image: pic(run(salt, "min", { size: 3 })) },
      { title: "Median 3x3", image: pic(run(salt, "median", { size: 3 })) },
    ],
  });
  figure("max", {
    message: "The max filter removes black specks and grows the bright disks.",
    panels: [
      { title: "Pepper noise", image: pic(pepper) },
      { title: "Max 3x3", image: pic(run(pepper, "max", { size: 3 })) },
      { title: "Median 3x3", image: pic(run(pepper, "median", { size: 3 })) },
    ],
  });
  figure("midpoint", {
    message: "The midpoint smooths Gaussian noise, but each impulse spreads into a gray square.",
    panels: [
      { title: "Gaussian noise", image: pic(gauss) },
      { title: "Midpoint 3x3", image: pic(run(gauss, "midpoint", { size: 3 })) },
      { title: "Salt and pepper", image: pic(both) },
      { title: "Midpoint 3x3", image: pic(run(both, "midpoint", { size: 3 })) },
    ],
  });
  figure("rank-order", {
    message: "Low ranks darken and shrink bright shapes. High ranks brighten and grow them.",
    panels: [1, 5, 9].map((rank) => ({
      title: `Rank ${rank} of 9`,
      image: pic(run(both, "rank-order", { size: 3, by: "rank", rank })),
    })),
  });
  figure("mode", {
    message:
      "On an image with mostly two gray values, the mode is a majority vote and keeps the edges hard.",
    panels: [
      { title: "Salt and pepper", image: pic(both) },
      { title: "Mode 3x3", image: pic(run(both, "mode", { size: 3 })) },
      { title: "Median 3x3", image: pic(run(both, "median", { size: 3 })) },
    ],
  });
  const star = run(synthetic.siemensStar(96, 96, 24), "noise-salt-pepper", {
    amount: 0.06,
    seed: 8,
  });
  figure("weighted-median", {
    message: "A heavier center weight keeps more of the thin spokes near the middle.",
    panels: [
      { title: "Salt and pepper", image: pic(star) },
      { title: "Median 3x3", image: pic(run(star, "median", { size: 3 })) },
      {
        title: "Center weight 3",
        image: pic(run(star, "weighted-median", { weights: "1 1 1; 1 3 1; 1 1 1" })),
      },
    ],
  });
  figure("alpha-trimmed-mean", {
    message: "With Gaussian noise and specks, trimming drops the specks and averages the rest.",
    panels: [
      { title: "Gaussian and impulse", image: pic(mixed) },
      { title: "Box 3x3", image: pic(run(mixed, "box", { size: 3 })) },
      { title: "Median 3x3", image: pic(run(mixed, "median", { size: 3 })) },
      {
        title: "Trimmed, t = 2",
        image: pic(run(mixed, "alpha-trimmed-mean", { size: 3, trim: 2 })),
      },
    ],
  });
  figure("geometric-mean", {
    message:
      "The geometric mean smooths Gaussian noise like the box filter. Each black speck blacks out its window.",
    panels: [
      { title: "Gaussian noise", image: pic(gauss) },
      { title: "Geometric 3x3", image: pic(run(gauss, "geometric-mean", { size: 3 })) },
      { title: "Pepper noise", image: pic(pepper) },
      { title: "Geometric 3x3", image: pic(run(pepper, "geometric-mean", { size: 3 })) },
    ],
  });
  figure("harmonic-mean", {
    message: "The harmonic mean removes white specks but turns black specks into black squares.",
    panels: [
      { title: "Salt noise", image: pic(salt) },
      { title: "Harmonic 3x3", image: pic(run(salt, "harmonic-mean", { size: 3 })) },
      { title: "Pepper noise", image: pic(pepper) },
      { title: "Harmonic 3x3", image: pic(run(pepper, "harmonic-mean", { size: 3 })) },
    ],
  });
  figure("contraharmonic-mean", {
    message: "Q = 1.5 removes black specks. Q = -1.5 removes white specks.",
    panels: [
      { title: "Pepper noise", image: pic(pepper) },
      { title: "Q = 1.5", image: pic(run(pepper, "contraharmonic-mean", { size: 3, order: 1.5 })) },
      { title: "Salt noise", image: pic(salt) },
      { title: "Q = -1.5", image: pic(run(salt, "contraharmonic-mean", { size: 3, order: -1.5 })) },
    ],
  });

  // Worked examples ------------------------------------------------------------------------

  const W = [
    [52, 61, 58],
    [49, 255, 63],
    [55, 0, 60],
  ];
  const sorted = W.flat().sort((a, b) => a - b);
  const at = (id, params, rows = W) => planeAt(id, rows, params, 1, 1);
  const window = block(`W = ${matrix(W)}`);
  const sortedLine = `Sorted: ${sorted.join(", ")}.`;

  example(
    "min",
    window +
      `\n${sortedLine} The min filter takes the first value, **${fix(at("min", { size: 3 }), 0)}**. The pepper pixel 0 wins, so this window turns black. The salt pixel 255 has no effect.\n`,
  );
  example(
    "max",
    window +
      `\n${sortedLine} The max filter takes the last value, **${fix(at("max", { size: 3 }), 0)}**. The salt pixel 255 wins, so this window turns white. The pepper pixel 0 has no effect.\n`,
  );
  example(
    "midpoint",
    window +
      `\n${sortedLine} The midpoint is (0 + 255) / 2 = **${fix(at("midpoint", { size: 3 }), 1)}**. Both impulses decide the result, and none of the seven ordinary values count. Without the two impulses, the window values run from 49 to 63, and the midpoint would be 56.\n`,
  );
  example(
    "rank-order",
    window +
      `\n${sortedLine}\n\n` +
      mdTable(
        ["Setting", "Rank", "Output"],
        [
          ["Rank 1", "1", fix(at("rank-order", { size: 3, by: "rank", rank: 1 }), 0)],
          ["Rank 3", "3", fix(at("rank-order", { size: 3, by: "rank", rank: 3 }), 0)],
          ["Rank 5 (median)", "5", fix(at("rank-order", { size: 3, by: "rank", rank: 5 }), 0)],
          [
            "Percentile 75",
            "floor(9 x 0.75) + 1 = 7",
            fix(at("rank-order", { size: 3, by: "percentile", percentile: 75 }), 0),
          ],
          ["Rank 9", "9", fix(at("rank-order", { size: 3, by: "rank", rank: 9 }), 0)],
        ],
      ) +
      "\nRanks 2 to 8 skip both impulses.\n",
  );

  const M = [
    [30, 30, 220],
    [30, 220, 220],
    [80, 220, 30],
  ];
  example(
    "mode",
    block(`W = ${matrix(M)}`) +
      `\nThe value 30 occurs 4 times, 220 occurs 4 times and 80 once. 30 and 220 tie, and the smaller value wins, so the output is **${fix(planeAt("mode", M, { size: 3 }, 1, 1), 0)}**. The median of the same window is ${fix(planeAt("median", M, { size: 3 }, 1, 1), 0)}.\n`,
  );

  const wm = [
    [40, 40, 200],
    [40, 200, 200],
    [40, 200, 40],
  ];
  const weights = [
    [1, 1, 1],
    [1, 3, 1],
    [1, 1, 1],
  ];
  const repeated = wm
    .flat()
    .flatMap((v, i) => Array.from({ length: weights.flat()[i] }, () => v))
    .sort((a, b) => a - b);
  example(
    "weighted-median",
    block(`W = ${matrix(wm)}, \\qquad w = ${matrix(weights)}`) +
      `\nThe center value counts 3 times, so the list has 11 entries: ${repeated.join(", ")}. The middle entry, the 6th, is **${fix(planeAt("weighted-median", wm, { weights: "1 1 1; 1 3 1; 1 1 1" }, 1, 1), 0)}**. The plain median of the 9 values is ${fix(planeAt("median", wm, { size: 3 }, 1, 1), 0)}, because 40 occurs 5 times. The heavier center keeps this pixel of a thin bright line.\n`,
  );

  const kept = sorted.slice(2, 7);
  example(
    "alpha-trimmed-mean",
    window +
      `\n${sortedLine} With t = 2, the two smallest values (0 and 49) and the two largest (63 and 255) are dropped. The mean of the 5 values left, ${kept.join(", ")}, is **${fix(at("alpha-trimmed-mean", { size: 3, trim: 2 }), 2)}**. The plain mean of all 9 values is ${fix(W.flat().reduce((a, b) => a + b, 0) / 9, 2)}.\n`,
  );

  const G = [
    [52, 61, 58],
    [49, 70, 63],
    [55, 66, 60],
  ];
  const gValues = G.flat();
  const mean = gValues.reduce((a, b) => a + b, 0) / 9;
  example(
    "geometric-mean",
    block(`W = ${matrix(G)}`) +
      `\nThe mean of the natural logarithms is ${fix(gValues.reduce((a, v) => a + Math.log(v), 0) / 9, 4)}. Its exponential is **${fix(planeAt("geometric-mean", G, { size: 3 }, 1, 1), 2)}**. The arithmetic mean of the same window is ${fix(mean, 2)}, slightly larger, as it always is. If one value were 0, the output would be 0.\n`,
  );
  example(
    "harmonic-mean",
    block(`W = ${matrix(G)}`) +
      `\nThe sum of the inverses is ${fix(
        gValues.reduce((a, v) => a + 1 / v, 0),
        5,
      )}. Then 9 divided by that sum is **${fix(planeAt("harmonic-mean", G, { size: 3 }, 1, 1), 2)}**. The geometric mean is ${fix(planeAt("geometric-mean", G, { size: 3 }, 1, 1), 2)} and the arithmetic mean ${fix(mean, 2)}. The harmonic mean is the smallest of the three.\n`,
  );
  const P = [
    [52, 61, 58],
    [49, 0, 63],
    [55, 66, 60],
  ];
  example(
    "contraharmonic-mean",
    block(`W = ${matrix(P)}`) +
      `\nThe center is a pepper pixel. With Q = 1.5, each value is weighted by its own power 1.5, and the pepper pixel gets weight 0. The output is **${fix(planeAt("contraharmonic-mean", P, { size: 3, order: 1.5 }, 1, 1), 2)}**, close to the 8 ordinary values. With Q = -1.5, the same window gives ${fix(planeAt("contraharmonic-mean", P, { size: 3, order: -1.5 }, 1, 1), 0)}, because the 0 dominates.\n`,
  );
}
