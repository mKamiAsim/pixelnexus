// Figures and worked examples for Gaussian and Laplacian pyramid filtering.
// gen-filter-docs.mjs calls pyramidDocs with its helpers. Every number comes from the code.

export function pyramidDocs(h) {
  const { run, pic, figure, example, mdTable, fix, synthetic, qualityMetrics, browserFilter } = h;

  const zone = synthetic.zonePlate(160, 160);
  figure("gaussian-pyramid", {
    message: "Gaussian pyramid filtering of a zone plate with 1 and 2 levels.",
    panels: [
      { title: "Zone plate", image: pic(zone) },
      { title: "1 level", image: pic(run(zone, "gaussian-pyramid", { levels: 1 })) },
      { title: "2 levels", image: pic(run(zone, "gaussian-pyramid", { levels: 2 })) },
    ],
  });

  // The response to a single 1 on a line of 21 pixels, on an even and on an odd pixel.
  const response = (at) => {
    const data = new Float32Array(21);
    data[at] = 1;
    const out = browserFilter("gaussian-pyramid").plane(
      { width: 21, height: 1, data },
      { levels: 1 },
      { border: "reflect101", originX: 0, originY: 0, channel: 0 },
    );
    return Array.from(out.data);
  };
  const columns = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  example(
    "gaussian-pyramid",
    mdTable(
      ["Input", ...columns.map((x) => `x = ${x}`)],
      [10, 11].map((at) => [`1 at x = ${at}`, ...columns.map((x) => fix(response(at)[x], 4))]),
    ) +
      "\nOne level, on a line of 21 pixels that is 0 except for a single 1. The two inputs differ only by a shift of one pixel, but the outputs differ by more than a shift. The 1 at x = 10 sits on a pixel that REDUCE keeps. Its response reaches from x = 6 to x = 14, with a peak of 0.2969. The 1 at x = 11 falls between two kept pixels. Its response reaches only from x = 8 to x = 14, with a lower peak of 0.25. Both responses add up to 1.\n",
  );

  const star = synthetic.siemensStar(160, 160);
  const gains = (g) => ({ levels: 4, gain1: g[0], gain2: g[1], gain3: g[2], gain4: g[3] });
  figure("laplacian-pyramid", {
    message: "Laplacian pyramid filtering of a Siemens star with two sets of gains.",
    panels: [
      { title: "Siemens star", image: pic(star) },
      {
        title: "Gains 0, 0, 1, 1",
        image: pic(run(star, "laplacian-pyramid", gains([0, 0, 1, 1]))),
      },
      {
        title: "Gains 1, 1, 2, 2",
        image: pic(run(star, "laplacian-pyramid", gains([1, 1, 2, 2]))),
      },
    ],
  });

  const disks = synthetic.disks(160, 160);
  const noisy = run(disks, "noise-gaussian", { sigma: 15, seed: 7, monochrome: true });
  const psnr = (image) => fix(qualityMetrics(image, disks).psnr, 2);
  const firstGains = [1, 0.5, 0.25, 0];
  example(
    "laplacian-pyramid",
    mdTable(
      ["Gain 2", ...firstGains.map((g) => `Gain 1 = ${g}`)],
      [1, 0.5].map((g2) => [
        String(g2),
        ...firstGains.map((g1) => psnr(run(noisy, "laplacian-pyramid", gains([g1, g2, 1, 1])))),
      ]),
    ) +
      `\nThe PSNR in dB against the clean disks, for the disks with Gaussian noise of sigma 15, ${psnr(noisy)} dB before the filter. Gain 3 and gain 4 stay 1. Gains of 1 everywhere give the noisy image back. Lowering gain 1 to 0.5 or 0.25 removes much of the noise, since most of it sits in the finest level. Gain 1 at 0, or a lower gain 2, also takes away part of the edges of the disks, so the PSNR falls again.\n`,
  );
}
