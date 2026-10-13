// Figures and worked examples for the reconstruction family.
// gen-filter-docs.mjs calls recDocs with its helpers. Every number comes from the filter code.

export function recDocs(h) {
  const { run, pic, figure, example, mdTable, synthetic, planeAt, fix } = h;
  const lum = { channelScope: "luminance" };
  const noisy = run(synthetic.disks(120, 120), "noise-salt-pepper", {
    amount: 0.04,
    seed: 6,
    monochrome: true,
  });
  const ramp = synthetic.ramp(120, 120);
  const textured = run(synthetic.disks(120, 120), "noise-gaussian", {
    sigma: 18,
    seed: 2,
    monochrome: true,
  });

  figure("reconstruction", {
    message:
      "Reconstruction by dilation with h = 60 on noisy disks. Every bright peak loses its top 60 levels, so the disks and the white specks are dimmer. The dark background stays as it was.",
    panels: [
      { title: "Noisy disks", image: pic(noisy) },
      {
        title: "Reconstruction, h 60",
        image: pic(run(noisy, "reconstruction", { ...lum, h: 60 })),
      },
    ],
  });
  figure("opening-by-reconstruction", {
    message:
      "Opening and opening by reconstruction with disk 2. Both remove the white specks, but only the reconstruction keeps the disks exactly as they were.",
    panels: [
      { title: "Noisy disks", image: pic(noisy) },
      { title: "Opening", image: pic(run(noisy, "opening", { ...lum, element: "disk 2" })) },
      {
        title: "By reconstruction",
        image: pic(run(noisy, "opening-by-reconstruction", { ...lum, element: "disk 2" })),
      },
    ],
  });
  figure("closing-by-reconstruction", {
    message:
      "Closing and closing by reconstruction with disk 2. Both fill the black specks in the background, and the reconstruction keeps the dark background exact.",
    panels: [
      { title: "Noisy disks", image: pic(noisy) },
      { title: "Closing", image: pic(run(noisy, "closing", { ...lum, element: "disk 2" })) },
      {
        title: "By reconstruction",
        image: pic(run(noisy, "closing-by-reconstruction", { ...lum, element: "disk 2" })),
      },
    ],
  });
  figure("geodesic", {
    message:
      "Geodesic dilation of the ramp moved down by 60, under the ramp itself. Each step copies the brighter value of the right neighbor, so 20 steps climb about 43 of the 60 levels. Near the right edge there is nothing brighter to copy.",
    panels: [
      { title: "Ramp", image: pic(ramp) },
      { title: "20 steps", image: pic(run(ramp, "geodesic", { ...lum, h: 60, steps: 20 })) },
    ],
  });
  figure("asf", {
    message:
      "An alternating sequential filter with disks up to size 2 removes both the white and the black specks.",
    panels: [
      { title: "Noisy disks", image: pic(noisy) },
      { title: "ASF, size 2", image: pic(run(noisy, "asf", { ...lum, size: 2 })) },
    ],
  });
  figure("leveling", {
    message:
      "Leveling of noisy disks with a Gaussian marker of sigma 2. The marker is blurred, but the leveling keeps the disk edges sharp while it flattens the noise.",
    panels: [
      { title: "Noisy disks", image: pic(textured) },
      { title: "Marker", image: pic(run(textured, "gaussian", { ...lum, sigma: 2, truncate: 4 })) },
      { title: "Leveling", image: pic(run(textured, "leveling", { ...lum, sigma: 2 })) },
    ],
  });

  // One row repeated three times: two peaks of different heights on a flat base.
  const row = [10, 10, 40, 10, 10, 90, 120, 90, 10, 10];
  const rows = [row, row, row];
  const xs = row.map((_, x) => x);
  const line = (id, params) => xs.map((x) => planeAt(id, rows, params, x, 1));
  const table = (label, out) =>
    mdTable(
      ["x", ...xs.map(String)],
      [
        ["Input", ...row.map(String)],
        [label, ...out.map((v) => fix(v, 1))],
      ],
    );
  example(
    "reconstruction",
    table("Reconstruction, h 50", line("reconstruction", { h: 50 })) +
      "\nThe marker is the row minus 50. The peak of 40 rises only 30 above its base, less than h, so the marker never reaches above the base there and the peak is flattened to 10. The peak of 120 rises 110, so it comes back as a plateau at 70, 50 below its top. The base is restored to 10, since the marker spreads to it from the large peak.\n",
  );
  example(
    "geodesic",
    table("1 step, h 50", line("geodesic", { h: 50, steps: 1 })) +
      "\nOne step of geodesic dilation from the row minus 50. Each pixel takes the largest marker value of itself and its neighbors, capped at the image. After one step the marker has spread one pixel. Values below 0 show as 0 in the image. More steps reach the reconstruction.\n",
  );
  example(
    "opening-by-reconstruction",
    table("Opening by reconstruction", line("opening-by-reconstruction", { element: "rect 3 1" })) +
      "\nThe element is a horizontal line of 3 pixels. The erosion removes the peak of 40, one pixel wide. The wide peak keeps the value 90 after the erosion, so reconstruction brings its base back exactly. Its top of 120 is only one pixel wide, so it is cut to 90.\n",
  );
  const valleys = row.map((v) => 130 - v);
  const vRows = [valleys, valleys, valleys];
  example(
    "closing-by-reconstruction",
    mdTable(
      ["x", ...xs.map(String)],
      [
        ["Input", ...valleys.map(String)],
        [
          "Closing by reconstruction",
          ...xs.map((x) =>
            fix(planeAt("closing-by-reconstruction", vRows, { element: "rect 3 1" }, x, 1), 1),
          ),
        ],
      ],
    ) +
      "\nThe row turned upside down, so the peaks are now valleys. The dilation with a horizontal line of 3 pixels fills the narrow valley at x = 2. The wide valley keeps the value 40 after the dilation, so reconstruction by erosion brings its rim back exactly. Its bottom of 10 is only one pixel wide, so it is filled to 40.\n",
  );
  example(
    "asf",
    table("ASF, size 1", line("asf", { size: 1, shape: "square" })) +
      "\nSize 1 opens and then closes with the 3 x 3 square. The opening removes the narrow peak at x = 2 and cuts the top of the wide peak, one pixel wide, to 90. The closing then has nothing to fill.\n",
  );
  example(
    "leveling",
    table("Leveling, marker sigma 1", line("leveling", { sigma: 1 })) +
      "\nThe marker is the row blurred with sigma 1. The leveling moves the row toward it. Wherever two neighbors end up different, the input differed in the same direction and by at least as much. So no new edges appear and no edge moves.\n",
  );
}
