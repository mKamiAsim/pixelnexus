// Figures and worked examples for the notch, comb and periodic noise filters and periodic noise.
// gen-filter-docs.mjs calls notchDocs with its helpers. Every number comes from the filter code.

export function notchDocs(h) {
  const { run, pic, figure, example, mdTable, fix, synthetic, frequencyResponse } = h;
  const { spectrumView, spectrumPicture, periodicPeaks, notchCenters } = h;
  const disks = synthetic.disks(160, 160);
  const wave = { amplitude: 40, fx: 0.1, fy: 0.05, phase: 0, channelScope: "rgb" };
  const noisy = run(disks, "noise-periodic", wave);
  const lumaPlane = (image) => spectrumView(image).plane;
  const spectrum = (image, id, params) => {
    const view = spectrumView(image);
    const response = id ? frequencyResponse(id, params, view.plane) : undefined;
    return pic(spectrumPicture(view, response), true);
  };

  const notch = { notches: "0.1 0.05", shape: "gaussian", radius: 0.015, border: "reflect" };
  figure("noise-periodic", {
    message:
      "A wave of frequency (0.1, 0.05) cycles per pixel adds stripes, and two bright peaks in the spectrum.",
    panels: [
      { title: "Disks", image: pic(disks) },
      { title: "With stripes", image: pic(noisy) },
      { title: "Spectrum", image: spectrum(noisy) },
    ],
  });
  figure("notch-reject", {
    message:
      "A Gaussian notch at (0.1, 0.05) removes the stripes. The tint shows the notch and its mirror points.",
    panels: [
      { title: "With stripes", image: pic(noisy) },
      { title: "Spectrum", image: spectrum(noisy, "notch-reject", notch) },
      { title: "Notch-reject", image: pic(run(noisy, "notch-reject", notch)) },
    ],
  });
  const pass = { ...notch, outputMapping: "offset", channelScope: "luminance" };
  figure("notch-pass", {
    message: "A notch-pass filter at the same place keeps only the stripes.",
    panels: [
      { title: "With stripes", image: pic(noisy) },
      { title: "Spectrum", image: spectrum(noisy, "notch-pass", pass) },
      { title: "Notch-pass", image: pic(run(noisy, "notch-pass", pass)) },
    ],
  });
  const auto = { threshold: 3, minFrequency: 0.05, maxPeaks: 8, radius: 0.015, border: "reflect" };
  figure("periodic-noise", {
    message: "Periodic noise suppression finds the peaks of the wave on its own and removes them.",
    panels: [
      { title: "With stripes", image: pic(noisy) },
      { title: "Peaks found", image: spectrum(noisy, "periodic-noise", auto) },
      { title: "Suppressed", image: pic(run(noisy, "periodic-noise", auto)) },
    ],
  });

  // Bars of 4 light and 4 dark pixels: a square wave with harmonics at odd multiples of 0.125.
  const bars = run(disks, "noise-periodic", { amplitude: 0, fx: 0, fy: 0, channelScope: "rgb" });
  for (let i = 0; i < bars.width * bars.height; i++) {
    const step = (i % bars.width) % 8 < 4 ? 30 : -30;
    for (let c = 0; c < 3; c++)
      bars.data[i * 4 + c] = Math.min(255, Math.max(0, bars.data[i * 4 + c] + step));
  }
  const comb = {
    fx: 0.125,
    fy: 0,
    harmonics: 3,
    shape: "gaussian",
    radius: 0.01,
    border: "reflect",
  };
  figure("comb", {
    message:
      "Bars every 8 pixels make peaks at 0.125 and 0.375 cycles per pixel. A comb with 3 harmonics removes them.",
    panels: [
      { title: "With bars", image: pic(bars) },
      { title: "Spectrum", image: spectrum(bars, "comb", comb) },
      { title: "Comb filter", image: pic(run(bars, "comb", comb)) },
    ],
  });

  // Worked examples -------------------------------------------------------------------------------
  const points = [
    ["at the notch", 0.1, 0.05],
    ["at its mirror point", -0.1, -0.05],
    ["across the x axis", 0.1, -0.05],
    ["0.01 away", 0.11, 0.05],
    ["0.03 away", 0.13, 0.05],
    ["far away", 0.3, 0.2],
  ];
  for (const [id, params, text] of [
    [
      "notch-reject",
      notch,
      "A Gaussian notch with radius 0.015 at (0.1, 0.05), with the reflect border. The border mirrors the image, so the notch also acts across the axes, at (0.1, -0.05) and (-0.1, 0.05). Far from the centers H is 1, so the rest of the spectrum is kept.",
    ],
    [
      "notch-pass",
      pass,
      "The same notch as a notch-pass filter. H is 1 minus the notch-reject response, so it is 1 at the centers and 0 far away.",
    ],
  ]) {
    const H = frequencyResponse(id, params);
    example(
      id,
      mdTable(
        ["Frequency (fx, fy)", "Where", "H"],
        points.map(([where, fx, fy]) => [`(${fx}, ${fy})`, where, fix(H(fx, fy), 4)]),
      ) + `\n${text}\n`,
    );
  }

  const combCenters = notchCenters(
    [1, 2, 3].map((k) => ({ fx: k * 0.125, fy: 0 })),
    true,
  );
  const combH = frequencyResponse("comb", comb);
  example(
    "comb",
    mdTable(
      ["Harmonic k", "Center (fx, fy)", "H at the center", "H halfway to the next"],
      [1, 2, 3].map((k) => [
        String(k),
        `(${fix(k * 0.125, 3)}, 0)`,
        fix(combH(k * 0.125, 0), 4),
        fix(combH(k * 0.125 + 0.0625, 0), 4),
      ]),
    ) +
      `\nThe base frequency (0.125, 0) with 3 harmonics gives notches at 0.125, 0.25 and 0.375 cycles per pixel and at their mirror points, ${combCenters.length} centers in all, since harmonics on the x axis have no separate mirror points across the axes. Between the harmonics H is close to 1.\n`,
  );

  const peaks = periodicPeaks(lumaPlane(noisy), auto);
  example(
    "periodic-noise",
    mdTable(
      ["Peak", "fx", "fy", "Period (pixels)"],
      peaks.map((p, i) => [
        String(i + 1),
        fix(p.fx, 4),
        fix(p.fy, 4),
        fix(1 / Math.hypot(p.fx, p.fy), 2),
      ]),
    ) +
      `\nThe peaks found on the noisy disks image of the figure, with the default settings. The wave has the frequency (0.1, 0.05), a period of ${fix(1 / Math.hypot(0.1, 0.05), 2)} pixels. On this 160 x 160 image the wave lies exactly on the grid of the FFT, in steps of 1 / 160 = 0.00625, so the peak is found at the wave frequency itself. Other waves give the grid frequency next to them. The peak gets a Gaussian notch at its mirror points too.\n`,
  );

  const xs = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const params = { amplitude: 40, fx: 0.125, fy: 0, phase: 0 };
  const row = (image) => xs.map((x) => image.data[x * 4]);
  const flat = run(disks, "noise-periodic", { ...params, amplitude: 0 });
  for (let i = 0; i < flat.data.length; i += 4) flat.data.set([100, 100, 100], i);
  example(
    "noise-periodic",
    mdTable(
      ["x", ...xs.map(String)],
      [["Value", ...row(run(flat, "noise-periodic", params)).map(String)]],
    ) +
      "\nA flat gray image of value 100 with a wave of amplitude 40 and frequency (0.125, 0). The wave repeats every 8 pixels: 100 + 40 sin(2 pi x / 8), rounded.\n",
  );
}
