// Figure and worked example for multiresolution diffusion.
// gen-filter-docs.mjs calls multiresDocs with its helpers. Every number comes from the filter code.

export function multiresDocs(h) {
  const { run, pic, figure, example, mdTable, fix, synthetic, createImage } = h;

  const clean = synthetic.disks(96, 96);
  // Wide blotches: Gaussian noise of sigma 60 on flat mid gray, where almost nothing clips,
  // blurred with a Gaussian of sigma 2, made 1.5 times stronger and added to the disks.
  const gray = createImage(96, 96);
  for (let i = 0; i < gray.data.length; i += 4) gray.data.set([128, 128, 128, 255], i);
  const soft = run(run(gray, "noise-gaussian", { sigma: 60, seed: 51 }), "gaussian", { sigma: 2 });
  const blotchy = clean.data.slice();
  for (let i = 0; i < blotchy.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const delta = 1.5 * (soft.data[i + c] - 128);
      blotchy[i + c] = Math.max(0, Math.min(255, Math.round(clean.data[i + c] + delta)));
    }
  }
  const noisy = { ...clean, data: blotchy };
  const psnr = (image) => {
    let sum = 0;
    for (let i = 0; i < image.data.length; i += 4) sum += (image.data[i] - clean.data[i]) ** 2;
    return 10 * Math.log10((255 * 255) / (sum / (image.data.length / 4)));
  };
  const diffuse = (levels, iterations) =>
    run(noisy, "multires-diffusion", { levels, iterations, kappa: 20, lambda: 0.2 });
  const plain10 = diffuse(0, 10);
  const plain40 = diffuse(0, 40);
  const pyramid = diffuse(3, 10);

  figure("multires-diffusion", {
    message:
      "On wide blotches of noise, 10 steps on one level barely help. 10 steps on each of 4 levels remove most of them.",
    panels: [
      { title: "Blotchy noise", image: pic(noisy) },
      { title: "1 level, 10 steps", image: pic(plain10) },
      { title: "4 levels, 10 steps", image: pic(pyramid) },
    ],
  });
  example(
    "multires-diffusion",
    mdTable(
      ["Method", "PSNR (dB)"],
      [
        ["Blotchy noise", fix(psnr(noisy), 2)],
        ["Perona-Malik, 10 steps (levels 0)", fix(psnr(plain10), 2)],
        ["Perona-Malik, 40 steps (levels 0)", fix(psnr(plain40), 2)],
        ["Multiresolution, 3 levels, 10 steps each", fix(psnr(pyramid), 2)],
      ],
    ) +
      "\nPSNR against the clean Disks and dots test image, 96 x 96. The noise is Gaussian noise of sigma 60 on flat gray, blurred with a Gaussian of sigma 2, made 1.5 times stronger and added to the image. K = 20 and lambda = 0.2 everywhere.\n",
  );
}
