// Figures and worked examples for Tikhonov regularization and constrained least squares.
// gen-filter-docs.mjs calls regularizeDocs with its helpers. Every number comes from the code.

export function regularizeDocs(h) {
  const { run, pic, figure, example, mdTable, fix, synthetic, qualityMetrics } = h;
  const { psfKernel, transferOf, clsGamma, operatorPower, spectrumOf } = h;
  const disks = synthetic.disks(160, 160);
  const defocus = { psf: "defocus", radius: 3, channelScope: "rgb" };
  const blurred = run(disks, "degrade-blur", defocus);
  const noisy = run(blurred, "noise-gaussian", { sigma: 4, seed: 7, monochrome: true });
  const tikhonov = { ...defocus, lambda: 0.01, operator: "gradient" };
  const cls = { ...defocus, noiseSigma: 4 };
  const tik = run(noisy, "tikhonov", tikhonov);
  const constrained = run(noisy, "cls", cls);
  const inverse = run(noisy, "inverse-filter", { ...defocus, cutoff: 0.71, threshold: 0.01 });
  figure("tikhonov", {
    message:
      "Defocus blur with noise of sigma 4. The inverse filter raises the noise, and Tikhonov with the gradient penalty keeps it down.",
    panels: [
      { title: "Blur and noise", image: pic(noisy) },
      { title: "Inverse filter", image: pic(inverse) },
      { title: "Tikhonov, 0.01", image: pic(tik) },
    ],
  });
  figure("cls", {
    message: "Constrained least squares with sigma 4 chooses its own weight from the noise level.",
    panels: [
      { title: "Blur and noise", image: pic(noisy) },
      { title: "CLS, sigma 4", image: pic(constrained) },
      { title: "Clean", image: pic(disks) },
    ],
  });

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
  const gain = (f, operator) => {
    const v = H(f);
    return fix(v / (v * v + 0.01 * operatorPower(operator, f, 0)), 2);
  };
  example(
    "tikhonov",
    mdTable(
      ["f_x (cycles per pixel)", ...fs.map(String)],
      [
        ["H", ...fs.map((f) => fix(H(f), 4))],
        ["Gain, identity", ...fs.map((f) => gain(f, "identity"))],
        ["Gain, gradient", ...fs.map((f) => gain(f, "gradient"))],
      ],
    ) +
      "\nThe gain for the Gaussian PSF with sigma 2 and lambda 0.01. With the identity it equals the Wiener gain with K = 0.01. The gradient penalty is 0 at frequency 0, so the mean brightness is kept exactly, and it grows with frequency, so high frequencies are held back more.\n",
  );

  const plane = {
    width: noisy.width,
    height: noisy.height,
    data: Float32Array.from({ length: noisy.width * noisy.height }, (_, i) => noisy.data[i * 4]),
  };
  const spectrum = spectrumOf(plane, "reflect");
  const [hr, hi] = transferOf(psfKernel(defocus), spectrum.width, spectrum.height);
  const gamma = clsGamma(spectrum, hr, hi, 4);
  const psnr = (image) => fix(qualityMetrics(image, disks).psnr, 2);
  example(
    "cls",
    mdTable(
      ["Image", "PSNR against the clean disks (dB)"],
      [
        ["Blur and noise", psnr(noisy)],
        ["Constrained least squares, sigma 4", psnr(constrained)],
        ["Tikhonov, gradient, lambda 0.01", psnr(tik)],
      ],
    ) +
      `\nFor the figure, with defocus of radius 3 and noise of sigma 4, the bisection finds gamma = ${gamma.toPrecision(3)} on the red channel. The residual of the result then has a mean square of 16, the noise power.\n`,
  );
}
