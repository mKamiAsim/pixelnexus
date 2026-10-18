// Figure and worked example for scale-space filtering.
// gen-filter-docs.mjs calls scaleSpaceDocs with its helpers. Every number comes from the code.

export function scaleSpaceDocs(h) {
  const { run, pic, figure, example, mdTable, fix, synthetic, browserFilter } = h;

  const disks = synthetic.disks(160, 160);
  const stack = {
    measure: "laplacian",
    sigma: 1,
    sigmaMax: 16,
    scales: 9,
    gamma: 1,
    outputMapping: "normalize",
  };
  figure("scale-space", {
    message:
      "Scale-space filtering of disks of several sizes with the normalized Laplacian, sigma 1 to 16 in 9 scales.",
    panels: [
      { title: "Disks", image: pic(disks) },
      {
        title: "Strongest response",
        image: pic(run(disks, "scale-space", { ...stack, output: "response" })),
      },
      {
        title: "Selected scale",
        image: pic(run(disks, "scale-space", { ...stack, output: "scale" })),
      },
    ],
  });

  // The sigma picked at the center of one disk of radius r, from a fine stack.
  const size = 97;
  const c = (size - 1) / 2;
  const chosen = (r) => {
    const data = Float32Array.from({ length: size * size }, (_, i) =>
      ((i % size) - c) ** 2 + (Math.floor(i / size) - c) ** 2 <= r * r ? 255 : 0,
    );
    const out = browserFilter("scale-space").plane(
      { width: size, height: size, data },
      { measure: "laplacian", sigma: 1, sigmaMax: 16, scales: 41, gamma: 1, output: "scale" },
      { border: "reflect101", originX: 0, originY: 0, channel: 0 },
    );
    return out.data[c * size + c];
  };
  const radii = [4, 6, 8, 12, 16];
  example(
    "scale-space",
    mdTable(
      ["Disk radius r", ...radii.map(String)],
      [
        ["r / sqrt 2", ...radii.map((r) => fix(r / Math.SQRT2, 3))],
        ["Selected sigma", ...radii.map((r) => fix(chosen(r), 3))],
      ],
    ) +
      "\nThe sigma that the normalized Laplacian with gamma 1 picks at the center of a bright disk on a 97 by 97 image. The stack has 41 scales from 1 to 16, so neighboring sigmas differ by a factor of about 1.07. At the center of a disk of height 1, the heat equation gives t times the Laplacian of L as -(r^2 / t) exp(-r^2 / (2 t)). Its size is largest at t = r^2 / 2, so at sigma = r / sqrt 2. The selected sigma matches it to within one step of the stack.\n",
  );
}
