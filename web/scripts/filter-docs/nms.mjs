// Figure and worked example for Sobel with non-maximum suppression.
// gen-filter-docs.mjs calls nmsDocs with its helpers. Every number comes from the filter code.

export function nmsDocs(h) {
  const { run, pic, row, figure, example, mdTable, synthetic } = h;
  const disks = synthetic.disks(96, 96);
  const lum = (id) => run(disks, id, { channelScope: "luminance", outputMapping: "normalize" });
  figure("sobel-nms", {
    message:
      "The Sobel magnitude is two or three pixels wide. Non-maximum suppression keeps its ridge line.",
    panels: [
      { title: "Disks", image: pic(disks) },
      { title: "Sobel magnitude", image: pic(lum("sobel")) },
      { title: "With suppression", image: pic(lum("sobel-nms")) },
    ],
  });
  const edge = run(synthetic.stepEdge(64, 8), "gaussian", { sigma: 1 });
  const opts = { channelScope: "luminance", outputMapping: "abs" };
  const m = row(run(edge, "sobel", opts), 4);
  const n = row(run(edge, "sobel-nms", opts), 4);
  const xs = [29, 30, 31, 32, 33, 34];
  example(
    "sobel-nms",
    mdTable(
      ["x", ...xs.map(String)],
      [
        ["Input", ...xs.map((x) => String(row(edge, 4)[x]))],
        ["Sobel magnitude", ...xs.map((x) => String(m[x]))],
        ["After suppression", ...xs.map((x) => String(n[x]))],
      ],
    ) +
      `\nA soft vertical edge, with every row the same, so the Sobel magnitude is 4 times the difference of the two horizontal neighbors. The table shows it clipped at 255. At x = 31 it is 4 x (${row(edge, 4)[32]} - ${row(edge, 4)[30]}) = ${4 * (row(edge, 4)[32] - row(edge, 4)[30])}, and at x = 32 it is 4 x (${row(edge, 4)[33]} - ${row(edge, 4)[31]}) = ${4 * (row(edge, 4)[33] - row(edge, 4)[31])}. The gradient points along x, so each pixel is compared with its left and right neighbors. These two pixels form the top of the ridge and keep their value. The rest become 0.\n`,
  );
}
