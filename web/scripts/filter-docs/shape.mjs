// Figures and worked examples for homomorphic filtering, the phase-only filter, spectral
// whitening, the log-Gabor filter and the global Wiener filter. gen-filter-docs.mjs calls
// shapeDocs with its helpers. Every number comes from the filter code.

export function shapeDocs(h) {
  const { run, pic, figure, example, mdTable, fix, synthetic, browserFilter, createImage } = h;
  const { frequencyResponse, qualityMetrics } = h;
  const responsePic = (id, params) => {
    const { size, values } = browserFilter(id).representation(params);
    const top = Math.max(1, ...values);
    const image = createImage(size, size);
    values.forEach((v, i) => {
      const g = Math.round((Math.max(0, v) / top) * 255);
      image.data.set([g, g, g, 255], i * 4);
    });
    return pic(image);
  };
  const disks = synthetic.disks(160, 160);
  // The derived filters stretch their result by default, so the figures do too.
  const gray = { channelScope: "luminance", outputMapping: "normalize" };

  // Disks lit from the left: the image times a light that falls from 1 to 0.25 across it.
  const lit = createImage(160, 160);
  for (let i = 0; i < 160 * 160; i++) {
    const light = 1 - (0.75 * (i % 160)) / 159;
    for (let c = 0; c < 3; c++) lit.data[i * 4 + c] = Math.round(disks.data[i * 4 + c] * light);
    lit.data[i * 4 + 3] = 255;
  }
  const homomorphic = { ...gray, gammaLow: 0.4, gammaHigh: 1.6, sharpness: 1, cutoff: 0.03 };
  figure("homomorphic", {
    message:
      "Homomorphic filtering turns down the lighting, which falls across the image, and keeps the disks.",
    panels: [
      { title: "Uneven lighting", image: pic(lit) },
      { title: "Response H", image: responsePic("homomorphic", homomorphic) },
      { title: "Homomorphic", image: pic(run(lit, "homomorphic", homomorphic)) },
    ],
  });

  const star = synthetic.siemensStar(160, 160);
  figure("phase-only", {
    message: "The phase-only filter keeps the edges of the disks and the spokes of the star.",
    panels: [
      { title: "Disks", image: pic(disks) },
      { title: "Phase only", image: pic(run(disks, "phase-only", gray)) },
      { title: "Siemens star", image: pic(star) },
      { title: "Phase only", image: pic(run(star, "phase-only", gray)) },
    ],
  });

  const zone = synthetic.zonePlate(160, 160);
  figure("spectral-whitening", {
    message: "Whitening raises fine detail until all rings of the spectrum are equally strong.",
    panels: [
      { title: "Disks", image: pic(disks) },
      {
        title: "Strength 0.5",
        image: pic(run(disks, "spectral-whitening", { ...gray, strength: 0.5 })),
      },
      {
        title: "Strength 1",
        image: pic(run(disks, "spectral-whitening", { ...gray, strength: 1 })),
      },
    ],
  });

  const logGabor = { ...gray, wavelength: 8, sigmaOnf: 0.55, angle: 0, angularSigma: 25 };
  figure("log-gabor", {
    message:
      "A log-Gabor filter with wavelength 8 and angle 0 responds to the parts of the star whose stripes run up and down.",
    panels: [
      { title: "Siemens star", image: pic(star) },
      { title: "Response H", image: responsePic("log-gabor", logGabor) },
      {
        title: "Magnitude",
        image: pic(run(star, "log-gabor", { ...logGabor, output: "magnitude" })),
      },
    ],
  });

  const noisy = run(disks, "noise-gaussian", { sigma: 20, seed: 7, monochrome: true });
  const wiener = { noiseSigma: 20, channelScope: "rgb" };
  const cleaned = run(noisy, "wiener-denoise", wiener);
  figure("wiener-denoise", {
    message: "The global Wiener filter with sigma 20 removes most of Gaussian noise of sigma 20.",
    panels: [
      { title: "Noise, sigma 20", image: pic(noisy) },
      { title: "Wiener, sigma 20", image: pic(cleaned) },
      { title: "Clean", image: pic(disks) },
    ],
  });

  // Worked examples -------------------------------------------------------------------------------
  const H = frequencyResponse("homomorphic", homomorphic);
  const ds = [0, 0.015, 0.03, 0.06, 0.12, 0.5];
  example(
    "homomorphic",
    mdTable(
      ["D (cycles per pixel)", ...ds.map(String)],
      [["H", ...ds.map((d) => fix(H(d, 0), 4))]],
    ) +
      "\nThe response for gamma_L = 0.4, gamma_H = 1.6, c = 1 and D_0 = 0.03, as in the figure. At frequency 0 it is gamma_L, so the mean of the log image is scaled by 0.4. Far from the center it reaches gamma_H. At D = D_0 it is gamma_L + (gamma_H - gamma_L)(1 - e^-1).\n",
  );

  const edge = synthetic.stepEdge(32, 8);
  const row = (image) => Array.from({ length: 12 }, (_, i) => image.data[(4 * 32 + 10 + i) * 4]);
  const phase = run(edge, "phase-only", { ...gray, outputMapping: "normalize" });
  example(
    "phase-only",
    mdTable(
      ["x", ...Array.from({ length: 12 }, (_, i) => String(10 + i))],
      [
        ["Input", ...row(edge).map(String)],
        ["Phase only, stretched", ...row(phase).map(String)],
      ],
    ) +
      "\nOne row of a step edge, 32 pixels wide, before and after the phase-only filter, stretched to the full range. The flat parts move to a middle gray, and the result swings most at the step, where the edge is.\n",
  );

  const gains = [0, 0.25, 0.5, 0.75, 1].map((strength) => {
    const out = run(zone, "spectral-whitening", { ...gray, strength, outputMapping: "clip" });
    const psnr = qualityMetrics(out, zone).psnr;
    return [String(strength), Number.isFinite(psnr) ? fix(psnr, 2) : "infinite"];
  });
  example(
    "spectral-whitening",
    mdTable(["Strength", "PSNR against the input (dB)"], gains) +
      "\nThe zone plate filtered with growing strength, clipped to 0 to 255, compared with the zone plate itself. Strength 0 keeps the image, so the PSNR is infinite. Higher strengths change the image more.\n",
  );

  const L = frequencyResponse("log-gabor", logGabor);
  const f0 = 1 / 8;
  const radial = [0.25, 0.5, 1, 2, 4].map((k) => [`${k} f_0`, fix(L(k * f0, 0), 4)]);
  const angular = [0, 25, 50, 90].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return [`${deg} degrees`, fix(L(f0 * Math.cos(a), -f0 * Math.sin(a)), 4)];
  });
  example(
    "log-gabor",
    mdTable(["Frequency along the filter direction", "H"], radial) +
      "\n" +
      mdTable(["Angle from the filter direction, at f_0", "H"], angular) +
      "\nThe response for wavelength 8, so f_0 = 0.125, bandwidth ratio 0.55 and angular spread 25 degrees. On a log scale the band is symmetric: H at f_0 / 2 equals H at 2 f_0. At one angular spread from the direction it is e^-0.5.\n",
  );

  const before = qualityMetrics(noisy, disks).psnr;
  const after = qualityMetrics(cleaned, disks).psnr;
  const sigma = 20;
  const powers = [1, 1.5, 2, 4, 10];
  example(
    "wiener-denoise",
    mdTable(
      ["Power P", ...powers.map((k) => `${k} sigma^2`)],
      [["H", ...powers.map((k) => fix(Math.max(0, 1 - (sigma * sigma) / (k * sigma * sigma)), 4))]],
    ) +
      `\nThe gain for a few values of the averaged power P. Where the power is not above the noise power sigma^2, the frequency is removed. For the figure, the PSNR against the clean disks rises from ${fix(before, 2)} dB with the noise to ${fix(after, 2)} dB after the filter.\n`,
  );
}
