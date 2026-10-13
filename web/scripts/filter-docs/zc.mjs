// Figure and worked examples for the zero-crossing detector and Marr-Hildreth.
// gen-filter-docs.mjs calls zeroCrossingDocs with its helpers. Every number comes from the filter code.

export function zeroCrossingDocs(h) {
  const { run, pic, row, figure, example, mdTable, synthetic } = h;
  const disks = synthetic.disks(96, 96);
  const edges = (threshold) =>
    run(disks, "marr-hildreth", { sigma: 2, threshold, channelScope: "luminance" });
  figure("marr-hildreth", {
    message:
      "With threshold 0 even faint shading makes edge loops. A small threshold keeps the real outlines.",
    panels: [
      { title: "Disks", image: pic(disks) },
      { title: "Threshold 0", image: pic(edges(0)) },
      { title: "Threshold 2", image: pic(edges(2)) },
    ],
  });
  const edge = synthetic.stepEdge(64, 8);
  const log = row(run(edge, "log", { sigma: 1.5, outputMapping: "offset" }), 4);
  const marks = row(run(edge, "marr-hildreth", { sigma: 1.5 }), 4);
  const xs = [29, 30, 31, 32, 33, 34];
  const text =
    mdTable(
      ["x", ...xs.map(String)],
      [
        ["Input", ...xs.map((x) => String(row(edge, 4)[x]))],
        ["LoG + 128", ...xs.map((x) => String(log[x]))],
        ["Edge mask", ...xs.map((x) => String(marks[x]))],
      ],
    ) +
    "\nA step edge with sigma 1.5. The LoG, shown with the offset mapping, is above 128 on the dark side and below it on the bright side. The first pixel below 128, next to one above, is marked with 255. It is the first bright pixel of the step.\n";
  example("marr-hildreth", text);
  example(
    "zero-crossing",
    text.replace(
      "A step edge with sigma 1.5.",
      "The same rule as the Marr-Hildreth detector, here on its LoG with sigma 1.5.",
    ),
  );
}
