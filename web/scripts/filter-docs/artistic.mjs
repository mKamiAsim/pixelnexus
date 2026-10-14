// Figures and worked examples for emboss, outline, edge enhance, vignette and pixelate.
// gen-filter-docs.mjs calls artisticDocs with its helpers. Every number comes from the code.

export function artisticDocs(h) {
  const { pic, figure, example, mdTable, fix, createImage, synthetic } = h;
  // The studio passes the catalog default mapping, clip. The bare engine would take abs.
  const run = (image, id, params) => h.run(image, id, { outputMapping: "clip", ...params });

  // The three fixed kernels: the test disks, and a profile across a step from 50 to 200.
  {
    const disks = synthetic.disks(160, 160);
    const step = createImage(12, 3);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 12; x++) {
        const v = x < 6 ? 50 : 200;
        step.data.set([v, v, v, 255], (y * 12 + x) * 4);
      }
    }
    const profile = (image) => Array.from({ length: 6 }, (_, k) => image.data[(12 + k + 3) * 4]);
    const filters = [
      ["Input", step, null],
      ["Emboss", run(step, "emboss", {}), "emboss"],
      ["Outline", run(step, "outline", {}), "outline"],
      ["Edge enhance", run(step, "edge-enhance", {}), "edge-enhance"],
      ["Edge enhance, more", run(step, "edge-enhance", { strength: "more" }), "edge-enhance"],
    ];
    const table =
      mdTable(
        ["Filter", "x = 3", "x = 4", "x = 5", "x = 6", "x = 7", "x = 8"],
        filters.map(([label, image]) => [label, ...profile(image).map(String)]),
      ) +
      "\nThe middle row of a 12 by 3 image that steps from 50 to 200 between x = 5 and x = 6. Values are clipped to 0 to 255 and rounded. The emboss result depends on the pixel below and to the left, which is on the same side of a vertical step, so only the step itself shows.\n";
    for (const [id, label] of [
      ["emboss", "Emboss"],
      ["outline", "Outline"],
      ["edge-enhance", "Edge enhance"],
    ]) {
      figure(id, {
        message: `The test disks, and ${label.toLowerCase()} with the default settings.`,
        panels: [
          { title: "Disks", image: pic(disks) },
          { title: label, image: pic(run(disks, id, {})) },
        ],
      });
      example(id, table);
    }
  }

  // Vignette: a flat gray image, read along the diagonal from the center to a corner.
  {
    const n = 201;
    const flat = createImage(n, n);
    for (let i = 0; i < n * n; i++) flat.data.set([200, 200, 200, 255], i * 4);
    const diagonal = (image) =>
      [0, 25, 50, 75, 100].map((k) => {
        const p = 100 + k;
        return image.data[(p * n + p) * 4];
      });
    const settings = [
      ["Amount 50 %, start 50 % (defaults)", {}],
      ["Amount 100 %, start 0", { amount: 100, start: 0 }],
      ["Amount 50 %, start 50 %, encoded values", { linearLight: false }],
    ];
    figure("vignette", {
      message: "A flat gray image, and the vignette with the default settings.",
      panels: [
        { title: "Flat gray", image: pic(flat) },
        { title: "Vignette", image: pic(run(flat, "vignette", {})) },
      ],
    });
    example(
      "vignette",
      mdTable(
        ["Setting", "d = 0", "d = 0.25", "d = 0.5", "d = 0.75", "d = 1"],
        settings.map(([label, params]) => [
          label,
          ...diagonal(run(flat, "vignette", params)).map(String),
        ]),
      ) +
        "\nA flat gray image of 200, 201 by 201 pixels, read along the diagonal from the center (d = 0) to the corner (d = 1). Below the start, nothing changes. In linear light, half the light is a level of about 146, not 100, so the corners look less dark than with encoded values.\n",
    );
  }

  // Pixelate: the Siemens star with blocks of 4 and 8.
  {
    const star = synthetic.siemensStar(160, 160);
    const psnr = (image) => {
      let sum = 0;
      for (let i = 0; i < 160 * 160; i++) sum += (image.data[i * 4] - star.data[i * 4]) ** 2;
      return 10 * Math.log10((255 * 255) / (sum / (160 * 160)));
    };
    const sizes = [2, 4, 8, 16];
    const results = sizes.map((size) => [size, run(star, "pixelate", { size })]);
    figure("pixelate", {
      message: "The Siemens star, and pixelate with blocks of 4 and 8 pixels.",
      panels: [
        { title: "Siemens star", image: pic(star) },
        { title: "4 x 4", image: pic(results[1][1]) },
        { title: "8 x 8", image: pic(results[2][1]) },
      ],
    });
    example(
      "pixelate",
      mdTable(
        ["Block size", "Blocks", "PSNR (dB)"],
        results.map(([size, image]) => [
          String(size),
          String(Math.ceil(160 / size) ** 2),
          fix(psnr(image), 2),
        ]),
      ) +
        "\nThe Siemens star of the figure, 160 by 160 pixels. The PSNR compares the result with the star. Larger blocks keep less of the fine detail.\n",
    );
  }
}
