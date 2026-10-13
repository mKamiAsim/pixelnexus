// Figures and worked examples for the binary morphology filters.
// gen-filter-docs.mjs calls binDocs with its helpers. Every number comes from the filter code.

const OPS = {
  "hit-or-miss": {
    params: { pattern: "-1 -1 -1; -1 1 -1; -1 -1 -1" },
    title: "Isolated pixels",
    message:
      "The hit-or-miss transform with the default pattern marks only the isolated white specks.",
    text: "The default pattern needs a white center with eight black neighbors, so only the isolated pixel at the top left is marked.",
  },
  thinning: {
    params: { method: "zhang-suen" },
    title: "Zhang-Suen",
    message:
      "Zhang-Suen thinning reduces every shape to lines one pixel thick. The ring stays a closed loop.",
    text: "The bar of three rows thins to one row. Thinning also shortens the ends a little.",
  },
  thickening: {
    params: { method: "zhang-suen", iterations: 3 },
    title: "3 iterations",
    message:
      "Thickening with 3 iterations grows the shapes by thinning the background, so they grow but do not merge.",
    text: "Three iterations of thinning on the black background grow the white shapes. The background between them thins to lines, so the shapes do not merge.",
  },
  skeleton: {
    params: { element: "cross 1" },
    title: "Skeleton, cross 1",
    message:
      "The morphological skeleton with the 3 x 3 cross. It follows the center of each shape but is often broken.",
    text: "With the 3 x 3 cross, the bar of three rows keeps the middle of its center row and its four corners. The L, one pixel thick, is its own skeleton.",
  },
  pruning: {
    params: { length: 3 },
    title: "Pruned, length 3",
    message:
      "Pruning with length 3 removes the short branches that thinning left, and keeps the main lines.",
    text: "The thin line has a spur of two pixels above it. Pruning with length 3 removes the spur and grows the line ends back to full length.",
  },
  "convex-hull": {
    params: { connectivity: "8" },
    title: "Convex hulls",
    message: "The convex hull of each object fills the L shape and the inside of the ring.",
    text: "The L gains the pixel in its inner corner, the only new pixel center inside the hull of its pixels. The bar and the isolated pixel are already convex.",
  },
  "ccl-filter": {
    params: { minArea: 10, maxArea: 100000 },
    title: "Area at least 10",
    message:
      "Connected-component filtering with a smallest area of 10 removes the specks and keeps every shape.",
    text: "The isolated pixel is an object of area 1, below the smallest area of 3, so it is removed. The bar of 18 pixels stays.",
  },
};

export function binDocs(h) {
  const { run, pic, figure, example, mdTable, planeAt } = h;
  // White shapes on black: a bar, an L, a ring, a triangle with a bump, and specks.
  const size = 96;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ring = Math.hypot(x - 70, y - 26);
      const white =
        (x >= 8 && x < 40 && y >= 10 && y < 18) ||
        (x >= 10 && x < 18 && y >= 30 && y < 70) ||
        (x >= 10 && x < 40 && y >= 62 && y < 70) ||
        (ring >= 10 && ring <= 16) ||
        (y >= 50 && y < 86 && Math.abs(x - 68) <= (y - 50) * 0.6) ||
        (x >= 66 && x < 70 && y >= 44 && y < 50) ||
        [
          [30, 40],
          [50, 20],
          [85, 60],
          [45, 88],
          [90, 8],
        ].some(([sx, sy]) => x === sx && y === sy);
      const v = white ? 255 : 0;
      data.set([v, v, v, 255], (y * size + x) * 4);
    }
  }
  const shapes = { width: size, height: size, data };
  const thinned = run(shapes, "thinning", { channelScope: "luminance" });
  for (const [id, op] of Object.entries(OPS)) {
    const input = id === "pruning" ? thinned : shapes;
    figure(id, {
      message: op.message,
      panels: [
        { title: id === "pruning" ? "Thinned shapes" : "Shapes", image: pic(input) },
        {
          title: op.title,
          image: pic(run(input, id, { ...op.params, channelScope: "luminance" })),
        },
      ],
    });
  }

  // A small grid: an isolated pixel, a bar three rows thick, and an L.
  const grid = [
    "1000000000",
    "0000000000",
    "0111111000",
    "0111111000",
    "0111111000",
    "0000000000",
    "0010000000",
    "0010000000",
    "0011100000",
  ].map((row) => [...row].map((c) => (c === "1" ? 255 : 0)));
  const line = [
    "0000000000000000000",
    "0000000001000000000",
    "0000000001000000000",
    "0111111111111111110",
    "0000000000000000000",
  ].map((row) => [...row].map((c) => (c === "1" ? 255 : 0)));
  const show = (rows) => rows.map((row) => row.map((v) => (v >= 128 ? "1" : "0")).join(" "));
  for (const [id, op] of Object.entries(OPS)) {
    const rows = id === "pruning" ? line : grid;
    const params = id === "ccl-filter" ? { minArea: 3, maxArea: 100 } : op.params;
    const out = rows.map((row, y) => row.map((_, x) => planeAt(id, rows, params, x, y)));
    const before = show(rows);
    const after = show(out);
    example(
      id,
      mdTable(
        ["Row", "Input", "Result"],
        before.map((r, i) => [String(i), `\`${r}\``, `\`${after[i]}\``]),
      ) + `\nA small binary image, 1 for white and 0 for black. ${op.text}\n`,
    );
  }
}
