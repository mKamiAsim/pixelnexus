// Figure and worked example for the joint bilateral filter.
// gen-filter-docs.mjs calls jointDocs with its helpers. Every number comes from the filter code.

export function jointDocs(h) {
  const { run, pic, figure, example, matrix, block, mdTable, fix, synthetic } = h;
  const { browserFilter, runFilter } = h;

  const clean = synthetic.disks(96, 96);
  const noisy = run(clean, "noise-gaussian", { sigma: 35, monochrome: true, seed: 51 });
  const joint = runFilter(
    noisy,
    browserFilter("joint-bilateral"),
    { sigmaSpace: 3, sigmaRange: 20, guideRange: "luma" },
    undefined,
    clean,
  ).image;
  figure("joint-bilateral", {
    message:
      "The noise hides the edges, so the bilateral filter cannot find them. With the clean image as the guide, the joint bilateral filter keeps them.",
    panels: [
      { title: "Strong noise", image: pic(noisy) },
      {
        title: "Bilateral",
        image: pic(run(noisy, "bilateral", { sigmaSpace: 3, sigmaRange: 40 })),
      },
      { title: "Joint, clean guide", image: pic(joint) },
    ],
  });

  const image = [
    [130, 60, 205],
    [90, 150, 195],
    [110, 80, 210],
  ];
  const guide = [
    [30, 30, 220],
    [30, 30, 220],
    [30, 30, 220],
  ];
  const sR = 20;
  const planes = (rows) =>
    [0, 1, 2].map(() => ({ width: 3, height: 3, data: Float32Array.from(rows.flat()) }));
  const out = browserFilter("joint-bilateral").color(
    planes(image),
    { sigmaSpace: 1, sigmaRange: sR, guideRange: "luma" },
    { border: "reflect101", originX: 0, originY: 0, channel: 0, guide: planes(guide) },
  );
  const leftMean = (130 + 60 + 90 + 150 + 110 + 80) / 6;
  example(
    "joint-bilateral",
    block(`I = ${matrix(image)}, \\qquad G = ${matrix(guide)}`) +
      `\nThe guide G has an edge between its second and third columns. With sigma_s = 1 and sigma_r = ${sR}, the guide difference across the edge is 190, so the value weight of the right column is about ${Math.exp(-(190 * 190) / (2 * sR * sR)).toExponential(1)}. Only the left two columns count:\n\n` +
      mdTable(
        ["", "Value"],
        [
          ["Filter output for the center", fix(out[0].data[4], 2)],
          ["Mean of the left two columns", fix(leftMean, 2)],
          ["Mean of all nine values", fix(image.flat().reduce((a, b) => a + b, 0) / 9, 2)],
        ],
      ) +
      `\nThe output is a distance-weighted mean of the six values on the dark side of the guide, so it is close to their plain mean. The bright right column does not pull it up, as it would in a plain mean.\n`,
  );
}
