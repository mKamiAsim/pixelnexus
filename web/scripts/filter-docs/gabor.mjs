// Figure and worked example for the Gabor filter.
// gen-filter-docs.mjs calls gaborDocs with its helpers. Every number comes from the filter code.

export function gaborDocs(h) {
  const { run, pic, figure, example, mdTable, synthetic, fix, gaborKernels } = h;
  const star = synthetic.siemensStar(160, 160);
  const at = (angle) =>
    pic(
      run(star, "gabor", {
        wavelength: 8,
        angle,
        sigma: 4,
        output: "magnitude",
        channelScope: "luminance",
      }),
    );
  figure("gabor", {
    message:
      "Gabor magnitude with wavelength 8 on a Siemens star. Each angle lights up the spokes that run across its direction, at the radius where their spacing is about 8 pixels.",
    panels: [
      { title: "Siemens star", image: pic(star) },
      { title: "Angle 0", image: at(0) },
      { title: "Angle 45", image: at(45) },
      { title: "Angle 90", image: at(90) },
    ],
  });

  const settings = { wavelength: 4, angle: 0, sigma: 1, aspect: 1 };
  const { re, im } = gaborKernels(settings);
  const xs = Array.from({ length: re.width }, (_, i) => i - re.anchorX);
  const mid = re.anchorY * re.width;
  example(
    "gabor",
    mdTable(
      ["x", ...xs.map(String)],
      [
        ["Envelope", ...xs.map((x) => fix(Math.exp(-0.5 * x * x) / (2 * Math.PI), 4))],
        ["cos(2 pi x / 4)", ...xs.map((x) => fix(Math.cos((2 * Math.PI * x) / 4), 4))],
        ["sin(2 pi x / 4)", ...xs.map((x) => fix(Math.sin((2 * Math.PI * x) / 4), 4))],
        ["Real kernel", ...xs.map((_, i) => fix(re.weights[mid + i], 4))],
        ["Imaginary kernel", ...xs.map((_, i) => fix(im.weights[mid + i], 4))],
      ],
    ) +
      `\nThe middle row of the kernels for wavelength 4, angle 0, sigma 1 and aspect ratio 1. The kernels are ${re.width} x ${re.height}, because the window ends at 3 sigma. On this row y = 0, so x' = x and y' = 0. Each weight is the envelope exp(-x^2 / 2) / (2 pi) times the cosine or the sine. The real kernel is even and finds thin lines. The imaginary kernel is odd and finds edges.\n`,
  );
}
