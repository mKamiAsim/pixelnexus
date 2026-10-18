// Figures and worked examples for Apply a known blur, inverse filtering and Wiener deconvolution.
// gen-filter-docs.mjs calls deconvDocs with its helpers. Every number comes from the filter code.

export function deconvDocs(h) {
  const { run, pic, figure, example, mdTable, fix, synthetic, psfKernel, qualityMetrics } = h;
  const disks = synthetic.disks(160, 160);
  const motion = { psf: "motion", length: 9, angle: 30, channelScope: "rgb" };
  const blurred = run(disks, "degrade-blur", motion);
  const noisy = run(blurred, "noise-gaussian", { sigma: 2, seed: 7, monochrome: true });
  figure("degrade-blur", {
    message: "A known blur: motion of 9 pixels at 30 degrees, and defocus with radius 3.",
    panels: [
      { title: "Disks", image: pic(disks) },
      { title: "Motion blur", image: pic(blurred) },
      {
        title: "Defocus blur",
        image: pic(run(disks, "degrade-blur", { psf: "defocus", radius: 3, channelScope: "rgb" })),
      },
    ],
  });
  const inverse = { ...motion, cutoff: 0.71, threshold: 0.05 };
  const wiener = { ...motion, noiseRatio: 0.01 };
  const inverseClean = run(blurred, "inverse-filter", inverse);
  const inverseNoisy = run(noisy, "inverse-filter", inverse);
  const wienerNoisy = run(noisy, "wiener-deconv", wiener);
  figure("inverse-filter", {
    message:
      "The inverse filter undoes the motion blur well, but a little noise, sigma 2, makes it fail.",
    panels: [
      { title: "Motion blur", image: pic(blurred) },
      { title: "Inverse filter", image: pic(inverseClean) },
      { title: "With noise, inverse", image: pic(inverseNoisy) },
    ],
  });
  figure("wiener-deconv", {
    message:
      "With the same noise, Wiener deconvolution with K = 0.01 undoes the blur and keeps the noise low.",
    panels: [
      { title: "Blur and noise", image: pic(noisy) },
      { title: "Inverse filter", image: pic(inverseNoisy) },
      { title: "Wiener, K = 0.01", image: pic(wienerNoisy) },
    ],
  });

  // Worked examples -------------------------------------------------------------------------------
  const kernel = psfKernel({ psf: "motion", length: 5, angle: 0 });
  const rows = Array.from({ length: kernel.height }, (_, j) =>
    Array.from({ length: kernel.width }, (_, i) => fix(kernel.weights[j * kernel.width + i], 3)),
  );
  example(
    "degrade-blur",
    mdTable(
      ["Row", ...rows[0].map((_, i) => `x ${i - kernel.anchorX}`)],
      rows.map((r, j) => [String(j - kernel.anchorY), ...r]),
    ) +
      "\nThe PSF for motion of length 5 at angle 0: one row of five equal weights that add up to 1. Each pixel becomes the mean of itself and its two neighbors on each side along x.\n",
  );

  // H along fx for the Gaussian PSF with sigma 2: the sum of k(x, y) cos(2 pi fx x).
  const gauss = psfKernel({ psf: "gaussian", sigma: 2 });
  const H = (f) => {
    let sum = 0;
    for (let j = 0; j < gauss.height; j++) {
      for (let i = 0; i < gauss.width; i++) {
        sum += gauss.weights[j * gauss.width + i] * Math.cos(2 * Math.PI * f * (i - gauss.anchorX));
      }
    }
    return sum;
  };
  const fs = [0, 0.05, 0.1, 0.15, 0.2, 0.3];
  const values = fs.map(H);
  example(
    "inverse-filter",
    mdTable(
      ["f_x (cycles per pixel)", ...fs.map(String)],
      [
        ["H", ...values.map((v) => fix(v, 4))],
        [
          "Gain 1 / H, smallest gain 0.05",
          ...values.map((v) => (Math.abs(v) >= 0.05 ? fix(1 / v, 2) : "0")),
        ],
      ],
    ) +
      "\nThe Gaussian PSF with sigma 2 along the f_x axis. The blur keeps less and less of each frequency. Dividing by H raises 0.15 cycles per pixel by about 20 times, and so its noise too. Below the smallest gain the frequency is set to 0.\n",
  );
  const psnr = (image) => fix(qualityMetrics(image, disks).psnr, 2);
  example(
    "wiener-deconv",
    mdTable(
      ["f_x (cycles per pixel)", ...fs.map(String)],
      [
        ["H", ...values.map((v) => fix(v, 4))],
        ["Wiener gain, K = 0.01", ...values.map((v) => fix(v / (v * v + 0.01), 2))],
      ],
    ) +
      `\nThe gain H / (H^2 + K) for the Gaussian PSF with sigma 2. It follows 1 / H while H is large, peaks near H = 0.1, and falls toward 0 where the blur left less than the noise. For the figure, the PSNR against the clean disks is ${psnr(noisy)} dB for the blurred image with noise, ${psnr(inverseNoisy)} dB after the inverse filter and ${psnr(wienerNoisy)} dB after Wiener deconvolution.\n`,
  );
}
