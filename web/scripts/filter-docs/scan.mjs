// Figures and worked examples for the adaptive scan filters: 2D LMS, 2D RLS and Kalman.
// gen-filter-docs.mjs calls scanDocs with its helpers. Every number comes from the filter code.

export function scanDocs(h) {
  const { run, pic, row, figure, example, mdTable, fix, synthetic, createImage } = h;

  const clean = synthetic.disks(96, 96);
  // Thin diagonal stripes with a period of 6 pixels, where the mean of the neighbors fails.
  const stripes = createImage(96, 96);
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 96; x++) {
      const v = Math.round(128 + 80 * Math.sin((2 * Math.PI * (x + y)) / 6));
      stripes.data.set([v, v, v, 255], (y * 96 + x) * 4);
    }
  }
  const psnr = (image, reference = clean) => {
    let sum = 0;
    for (let i = 0; i < image.data.length; i += 4) sum += (image.data[i] - reference.data[i]) ** 2;
    return 10 * Math.log10((255 * 255) / (sum / (image.data.length / 4)));
  };
  const noisy = run(clean, "noise-gaussian", { sigma: 20, seed: 41 });
  const noisyStripes = run(stripes, "noise-gaussian", { sigma: 20, seed: 42 });
  const lmsOf = (image, mu) => run(image, "lms-2d", { size: 3, mu });
  const rlsOf = (image) => run(image, "rls-2d", { size: 3, lambda: 0.999, delta: 0.01 });
  const lms = lmsOf(noisy, 0.05);
  const rls = rlsOf(noisy);
  const kalman = run(noisy, "kalman", { sigma: 20 });
  const box = run(noisy, "box", { size: 3 });

  figure("lms-2d", {
    message:
      "The prediction removes much of the noise. The error is the part the neighbors cannot predict: the noise and the outlines of the disks.",
    panels: [
      { title: "Noise, sigma 20", image: pic(noisy) },
      { title: "LMS prediction", image: pic(lms) },
      {
        title: "LMS error",
        image: pic(run(noisy, "lms-2d", { size: 3, mu: 0.2, output: "error" })),
      },
    ],
  });
  figure("rls-2d", {
    message:
      "RLS learns within the first rows. Its error, like the LMS error, shows the noise and the outlines.",
    panels: [
      { title: "Noise, sigma 20", image: pic(noisy) },
      { title: "RLS prediction", image: pic(rls) },
      {
        title: "RLS error",
        image: pic(run(noisy, "rls-2d", { size: 3, lambda: 0.999, delta: 0.01, output: "error" })),
      },
    ],
  });
  // The row that crosses the most disk edges.
  let edgeRow = 0;
  let mostEdges = -1;
  for (let y = 0; y < 96; y++) {
    const line = row(clean, y);
    const edges = line.filter((v, x) => x > 0 && v !== line[x - 1]).length;
    if (edges > mostEdges) [edgeRow, mostEdges] = [y, edges];
  }
  figure("kalman", {
    message:
      "Along one row through the disks, the Kalman smoother removes most of the noise. It rounds the steps, most at the narrow disk.",
    profile: {
      x: Array.from({ length: 96 }, (_, i) => i),
      xlabel: "x (pixels)",
      ylabel: "Value",
      lines: [
        { label: "Clean", values: row(clean, edgeRow) },
        { label: "Noise, sigma 20", values: row(noisy, edgeRow) },
        { label: "Kalman, sigma 20", values: row(kalman, edgeRow) },
      ],
    },
  });

  const table = mdTable(
    ["Method", "Disks (dB)", "Stripes (dB)"],
    [
      ["Noisy, sigma 20", fix(psnr(noisy), 2), fix(psnr(noisyStripes, stripes), 2)],
      ["Box 3x3", fix(psnr(box), 2), fix(psnr(run(noisyStripes, "box", { size: 3 }), stripes), 2)],
      [
        "Mean of the 8 neighbors (2D LMS, mu 0)",
        fix(psnr(lmsOf(noisy, 0)), 2),
        fix(psnr(lmsOf(noisyStripes, 0), stripes), 2),
      ],
      ["2D LMS, 3x3, mu 0.05", fix(psnr(lms), 2), fix(psnr(lmsOf(noisyStripes, 0.05), stripes), 2)],
      ["2D RLS, 3x3, lambda 0.999", fix(psnr(rls), 2), fix(psnr(rlsOf(noisyStripes), stripes), 2)],
      [
        "Kalman, sigma 20",
        fix(psnr(kalman), 2),
        fix(psnr(run(noisyStripes, "kalman", { sigma: 20 }), stripes), 2),
      ],
    ],
  );
  const note =
    "\nPSNR against the clean images, 96 x 96: the Disks and dots test image, and diagonal stripes with a period of 6 pixels. Gaussian noise of sigma 20, seeds 41 and 42.\n";
  for (const id of ["lms-2d", "rls-2d", "kalman"]) example(id, table + note);
}
