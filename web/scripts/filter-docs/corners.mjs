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
}
