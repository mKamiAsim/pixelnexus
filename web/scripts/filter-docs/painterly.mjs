// Figures and worked examples for oil painting, pencil sketch, cartoon, halftone, bloom, bokeh
// and tilt-shift. gen-filter-docs.mjs calls painterlyDocs with its helpers. Every number comes
// from the code.

export function painterlyDocs(h) {
  const { run, pic, figure, example, mdTable, fix, createImage, synthetic, tiltSigma } = h;
  const color = (image) => pic(image, true);

  // A small scene: a sky that brightens downward, green ground, three colored disks, and noise.
  const scene = createImage(160, 120);
  const disks = [
    [45, 55, 22, [200, 40, 40]],
    [95, 70, 18, [230, 200, 40]],
    [130, 45, 14, [40, 80, 200]],
  ];
  for (let y = 0; y < 120; y++) {
    for (let x = 0; x < 160; x++) {
      let c = y < 80 ? [90 + y, 140 + y, 220] : [60, 130 - (y - 80), 50];
      for (const [cx, cy, r, rgb] of disks) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) c = rgb;
      const n = (((x * 31 + y * 17) % 11) - 5) * 1.5;
      scene.data.set(
        [...c.map((v) => Math.round(Math.min(255, Math.max(0, v + n)))), 255],
        (y * 160 + x) * 4,
      );
    }
  }
  const distinct = (image) => {
    const seen = new Set();
    for (let i = 0; i < image.data.length; i += 4)
      seen.add(image.data[i] * 65536 + image.data[i + 1] * 256 + image.data[i + 2]);
    return seen.size;
  };

  // Oil painting.
  figure("oil-painting", {
    message: "A test scene, and the oil painting effect with radius 3 and 20 levels.",
    panels: [
      { title: "Scene", image: color(scene) },
      { title: "Oil painting", image: color(run(scene, "oil-painting", {})) },
    ],
  });
  example(
    "oil-painting",
    mdTable(
      ["Settings", "Distinct colors"],
      [
        ["Input", String(distinct(scene))],
        ...[
          [1, 20],
          [3, 20],
          [3, 8],
          [6, 8],
        ].map(([radius, levels]) => [
          `radius ${radius}, ${levels} levels`,
          String(distinct(run(scene, "oil-painting", { radius, levels }))),
        ]),
      ],
    ) +
      "\nThe number of different colors in the scene of the figure, before and after. Each pixel takes the mean color of its window's main bin, so far fewer colors remain than in the input. The count does not fall steadily with larger windows or fewer bins, since each window makes its own mean.\n",
  );

  // Pencil sketch: a profile across a step from 80 to 200.
  const step = createImage(24, 3);
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 24; x++)
      step.data.set([...Array(3).fill(x < 12 ? 80 : 200), 255], (y * 24 + x) * 4);
  figure("pencil-sketch", {
    message: "A test scene, and the pencil sketch with blur 3.",
    panels: [
      { title: "Scene", image: color(scene) },
      { title: "Pencil sketch", image: pic(run(scene, "pencil-sketch", { sigma: 3 })) },
    ],
  });
  {
    const out = run(step, "pencil-sketch", { sigma: 3 });
    const xs = [6, 9, 10, 11, 12, 13, 14, 17];
    example(
      "pencil-sketch",
      mdTable(
        ["x", ...xs.map(String)],
        [
          ["Input", ...xs.map((x) => String(step.data[(24 + x) * 4]))],
          ["Sketch, blur 3", ...xs.map((x) => String(out.data[(24 + x) * 4]))],
        ],
      ) +
        "\nThe middle row of a 24 by 3 image that steps from 80 to 200 between x = 11 and x = 12. Far from the step, the bright side is white and the dark side comes close to it, 243 at x = 6. Just left of the step, the blurred negative takes in the bright side, so the dodge stays well below white and draws the line on the dark side.\n",
    );
  }

  // Cartoon.
  figure("cartoon", {
    message: "A test scene, and the cartoon effect with the default settings.",
    panels: [
      { title: "Scene", image: color(scene) },
      { title: "Cartoon", image: color(run(scene, "cartoon", {})) },
    ],
  });
  {
    const share = (image) => {
      let black = 0;
      for (let i = 0; i < image.data.length; i += 4)
        if (image.data[i] + image.data[i + 1] + image.data[i + 2] === 0) black++;
      return (100 * black) / (image.width * image.height);
    };
    example(
      "cartoon",
      mdTable(
        ["Line threshold", "Line pixels (%)", "Distinct colors"],
        [1, 2, 4, 8].map((d) => {
          const out = run(scene, "cartoon", { lineOffset: d });
          return [String(d), fix(share(out), 1), String(distinct(out))];
        }),
      ) +
        `\nThe scene of the figure has ${distinct(scene)} distinct colors. Two bilateral passes cut that number down, and a higher line threshold keeps only the strongest edges as lines.\n`,
    );
  }

  // Halftone.
  const ramp = synthetic.ramp(160, 80);
  figure("halftone", {
    message: "A gray ramp, and its halftone with cells of 8 pixels at 45 degrees.",
    panels: [
      { title: "Gray ramp", image: pic(ramp) },
      { title: "Halftone", image: pic(run(ramp, "halftone", { cell: 8, channelScope: "rgb" })) },
    ],
  });
  {
    const grays = [32, 64, 128, 192, 224];
    const mean = (image) => {
      let s = 0;
      for (let i = 0; i < image.data.length; i += 4) s += image.data[i];
      return s / (image.width * image.height);
    };
    example(
      "halftone",
      mdTable(
        ["Flat gray", ...grays.map(String)],
        [
          [
            "Mean after the halftone",
            ...grays.map((g) => {
              const flat = createImage(96, 96);
              for (let i = 0; i < flat.data.length; i += 4) flat.data.set([g, g, g, 255], i);
              return fix(mean(run(flat, "halftone", { cell: 8, channelScope: "rgb" })), 1);
            }),
          ],
        ],
      ) +
        "\nFlat 96 by 96 grays with cells of 8 pixels at 45 degrees. Each dot inks the cell's share, so the mean tone stays within a few levels. The rest comes from the cells cut by the image edge and from the anti-aliased dot edges.\n",
    );
  }

  // A night scene for bloom and bokeh: a dark blue background with small lights.
  const night = createImage(160, 120);
  for (let y = 0; y < 120; y++)
    for (let x = 0; x < 160; x++) night.data.set([10, 14, 30 + (y >> 2), 255], (y * 160 + x) * 4);
  const lights = [
    [30, 30, [255, 230, 180]],
    [80, 50, [255, 255, 255]],
    [125, 35, [255, 140, 80]],
    [55, 90, [180, 220, 255]],
    [115, 95, [255, 250, 220]],
  ];
  for (const [cx, cy, rgb] of lights) {
    for (let y = cy - 2; y <= cy + 2; y++)
      for (let x = cx - 2; x <= cx + 2; x++) night.data.set([...rgb, 255], (y * 160 + x) * 4);
  }
  figure("bloom", {
    message:
      "Small lights on a dark background, and the bloom with threshold 60, glow size 8 and strength 150.",
    panels: [
      { title: "Lights", image: color(night) },
      {
        title: "Bloom",
        image: color(run(night, "bloom", { threshold: 60, sigma: 8, strength: 150 })),
      },
    ],
  });
  {
    const out = run(night, "bloom", { threshold: 60, sigma: 8, strength: 150 });
    const ds = [0, 3, 6, 10, 15, 20];
    example(
      "bloom",
      mdTable(
        ["Distance from the white light", ...ds.map(String)],
        [
          ["Red before", ...ds.map((d) => String(night.data[(50 * 160 + 80 + d) * 4]))],
          ["Red after", ...ds.map((d) => String(out.data[(50 * 160 + 80 + d) * 4]))],
        ],
      ) +
        "\nThe red channel along the row through the white light of the figure, at x = 80 plus the distance. The light itself stays clipped at 255, and the glow lifts the dark background for some distance around it.\n",
    );
  }

  figure("bokeh", {
    message:
      "Small lights on a dark background, and the bokeh blur with radius 8 and highlight boost 6.",
    panels: [
      { title: "Lights", image: color(night) },
      { title: "Bokeh", image: color(run(night, "bokeh", { radius: 8, boost: 6 })) },
    ],
  });
  {
    const rows = [0, 4].map((boost) => {
      const out = run(night, "bokeh", { radius: 8, boost });
      return [
        `boost ${boost}`,
        ...[0, 3, 6, 9, 12].map((d) => String(out.data[(50 * 160 + 80 + d) * 4])),
      ];
    });
    example(
      "bokeh",
      mdTable(["Distance from the white light", "0", "3", "6", "9", "12"], rows) +
        "\nThe red channel along the row through the white light, with radius 8. Without the boost, the 5 by 5 light spreads its light thinly over the disk. With the boost, it fills a much brighter disk. Both fall to the background between 9 and 12 pixels away, the disk radius plus the half width of the light.\n",
    );
  }

  // Tilt-shift.
  const board = synthetic.checkerboard(160, 120, 8);
  figure("tilt-shift", {
    message: "A checkerboard, and the tilt-shift blur with the default settings.",
    panels: [
      { title: "Checkerboard", image: pic(board) },
      { title: "Tilt-shift", image: pic(run(board, "tilt-shift", {})) },
    ],
  });
  {
    const fs = [0, 0.1, 0.2, 0.25, 0.3, 0.35, 0.5];
    example(
      "tilt-shift",
      mdTable(
        ["Row height f", ...fs.map(String)],
        [["sigma", ...fs.map((f) => fix(tiltSigma(f, {}), 3))]],
      ) +
        "\nThe blur sigma with the default settings: center 0.5, a sharp band of 0.15 on each side, a transition of 0.25 and a largest blur of 6. Rows from 0.35 to 0.65 stay sharp. The blur reaches 6 at a distance of 0.4 from the center, at f = 0.1 and above it.\n",
    );
  }
}
