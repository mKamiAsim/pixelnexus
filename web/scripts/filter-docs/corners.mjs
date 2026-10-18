// Figures and worked examples for the corner detectors.
// gen-filter-docs.mjs calls cornerDocs with its helpers. Every number comes from the filter code.

export function cornerDocs(h) {
  const { run, pic, figure, example, mdTable, synthetic, planeAt, fix } = h;
  const board = synthetic.checkerboard(64, 64, 16);
  const lum = { channelScope: "luminance", outputMapping: "normalize" };
  for (const [id, name] of [
    ["harris", "Harris"],
    ["shi-tomasi", "Shi-Tomasi"],
  ]) {
    figure(id, {
      message: `${name} on a checkerboard. The response peaks where four squares meet, and the corner points mark those peaks.`,
      panels: [
        { title: "Checkerboard", image: pic(board) },
        { title: "Response", image: pic(run(board, id, { ...lum })) },
        {
          title: "Corner points",
          image: pic(run(board, id, { ...lum, output: "corners", distance: 3 })),
        },
      ],
    });
  }

  // A bright quadrant: flat at (3, 3), an edge at (10, 17) and a corner at (10, 10).
  const rows = Array.from({ length: 21 }, (_, y) =>
    Array.from({ length: 21 }, (_, x) => (x >= 10 && y >= 10 ? 200 : 50)),
  );
  const points = [
    ["Flat area", 3, 3],
    ["Edge", 10, 17],
    ["Corner", 10, 10],
  ];
  for (const id of ["harris", "shi-tomasi"]) {
    const table = mdTable(
      ["Pixel", "x", "y", "Response"],
      points.map(([name, x, y]) => [
        name,
        String(x),
        String(y),
        fix(planeAt(id, rows, { sigma: 1 }, x, y), 4),
      ]),
    );
    const text =
      id === "harris"
        ? "The Harris response is 0 in the flat area, negative on the edge, where only one direction changes, and positive at the corner."
        : "The smaller eigenvalue is 0 in the flat area and on the straight edge, where only one direction changes. It is large only at the corner.";
    example(
      id,
      `${table}\nA 21 x 21 image, 50 everywhere except a bright quadrant of 200 from x = 10 and y = 10, with sigma 1${id === "harris" ? " and k = 0.05" : ""}. The image is read on a 0 to 1 scale. ${text}\n`,
    );
  }

  // Bright shapes with corners on a dark background: two rectangles and a triangle.
  const size = 96;
  const shapes = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside =
        (x >= 10 && x < 40 && y >= 12 && y < 36) ||
        (x >= 56 && x < 84 && y >= 20 && y < 44) ||
        (y >= 56 && y < 86 && Math.abs(x - 48) <= (y - 56) * 0.9);
      const v = inside ? 210 : 40;
      shapes.set([v, v, v, 255], (y * size + x) * 4);
    }
  }
  const shapesImage = { width: size, height: size, data: shapes };
  for (const id of ["moravec", "fast"]) {
    figure(id, {
      message:
        id === "fast"
          ? "FAST on bright shapes. The score is high at the corners, and the corner points mark them."
          : "Moravec on bright shapes. The response is high at the corners and also along the slanted edges of the triangle, which fall between the four tested directions.",
      panels: [
        { title: "Shapes", image: pic(shapesImage) },
        {
          title: id === "fast" ? "Score" : "Response",
          image: pic(run(shapesImage, id, { ...lum })),
        },
        {
          title: "Corner points",
          image: pic(run(shapesImage, id, { ...lum, output: "corners", distance: 3 })),
        },
      ],
    });
  }

  const moravecTable = mdTable(
    ["Pixel", "x", "y", "Response"],
    points.map(([name, x, y]) => [
      name,
      String(x),
      String(y),
      fix(planeAt("moravec", rows, {}, x, y), 4),
    ]),
  );
  example(
    "moravec",
    `${moravecTable}
The same 21 x 21 image as for Harris, with a 3 x 3 window. Values are on a 0 to 1 scale. In the flat area no shift changes the window. On the vertical edge the shift (0, 1) moves the window along the edge and changes nothing, so the smallest change is 0. At the corner every shift changes the window, so the response is positive.
`,
  );

  // A dark pixel at the inside corner of a bright L: the ring has a long bright run.
  const ringRows = Array.from({ length: 7 }, (_, y) =>
    Array.from({ length: 7 }, (_, x) => (x >= 4 || y >= 4 ? 200 : 40)),
  );
  const ring = [
    [0, -3],
    [1, -3],
    [2, -2],
    [3, -1],
    [3, 0],
    [3, 1],
    [2, 2],
    [1, 3],
    [0, 3],
    [-1, 3],
    [-2, 2],
    [-3, 1],
    [-3, 0],
    [-3, -1],
    [-2, -2],
    [-1, -3],
  ];
  const values = ring.map(([dx, dy]) => ringRows[3 + dy][3 + dx]);
  const brighter = values.filter((v) => v / 255 > 40 / 255 + 0.15).length;
  const score9 = planeAt("fast", ringRows, { n: 9, threshold: 0.15, border: "replicate" }, 3, 3);
  const score12 = planeAt("fast", ringRows, { n: 12, threshold: 0.15, border: "replicate" }, 3, 3);
  example(
    "fast",
    mdTable(
      ["Circle pixel", ...ring.map((_, k) => String(k + 1))],
      [["Value", ...values.map(String)]],
    ) +
      `
The center of a 7 x 7 patch has the value 40. The patch is 200 where x or y is 4 or more, so the center sits at the inside corner of a bright L. ${brighter} circle pixels in a row are brighter than 40 / 255 + 0.15, and none are darker. With n = 9 the segment test passes, and the score is ${brighter} x (200 / 255 - 40 / 255 - 0.15) = ${fix(score9, 4)}. With n = 12 the run is too short, so the score is ${fix(score12, 4)}.
`,
  );
}
