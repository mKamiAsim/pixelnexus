// Figures and worked examples for the Retinex filters.
// gen-filter-docs.mjs calls retinexDocs with its helpers. Every number comes from the code.

export function retinexDocs(h) {
  const { run, pic, figure, example, mdTable, fix, createImage, hsvToRgb } = h;

  // A chart of 60-pixel patches that repeats every 180 pixels across, lit from the left: the
  // light falls linearly to 15 percent at the right edge. Each tile has six hues down and
  // saturations 0.8, 0.5 and 0 across, so the left and right quarters hold the same patches. The
  // chart is large enough for the default scales, and the figures show it at a quarter size.
  const patch = 60;
  const tile = 3 * patch;
  const width = 4 * tile;
  const height = 6 * patch;
  const shaded = createImage(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const saturation = [0.8, 0.5, 0][Math.floor((x % tile) / patch)];
      const [r, g, b] = hsvToRgb(60 * Math.floor(y / patch), saturation, 0.9);
      const light = 1 - (0.85 * x) / (width - 1);
      shaded.data.set(
        [Math.round(r * light), Math.round(g * light), Math.round(b * light), 255],
        (y * width + x) * 4,
      );
    }
  }

  /** The image at 1 / f of its size, each pixel the mean of an f x f block. */
  const shrink = (image, f) => {
    const out = createImage(image.width / f, image.height / f);
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        for (let c = 0; c < 4; c++) {
          let sum = 0;
          for (let j = 0; j < f; j++)
            for (let i = 0; i < f; i++)
              sum += image.data[((y * f + j) * image.width + x * f + i) * 4 + c];
          out.data[(y * out.width + x) * 4 + c] = Math.round(sum / (f * f));
        }
      }
    }
    return out;
  };
  const color = (image) => pic(shrink(image, 4), true);

  // Mean luma in the left and right quarters, and the mean saturation (max - min) / max of the
  // patches that have color.
  const measure = (image) => {
    let left = 0;
    let right = 0;
    let count = 0;
    let saturation = 0;
    let colored = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        const [r, g, b] = [image.data[o], image.data[o + 1], image.data[o + 2]];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        if (x < tile) {
          left += luma;
          count++;
        }
        if (x >= width - tile) right += luma;
        const top = Math.max(r, g, b);
        if (x % tile < 2 * patch && top > 0) {
          saturation += (top - Math.min(r, g, b)) / top;
          colored++;
        }
      }
    }
    return [left / count, right / count, (100 * saturation) / colored];
  };

  const variants = [
    ["Shaded chart", shaded],
    ["SSR, sigma 80", run(shaded, "retinex-ssr", {})],
    ["SSR, sigma 80, intensity", run(shaded, "retinex-ssr", { apply: "intensity" })],
    ["MSR, sigma 15, 80, 250", run(shaded, "retinex-msr", {})],
    ["MSR, intensity", run(shaded, "retinex-msr", { apply: "intensity" })],
    ["MSRCR, alpha 125", run(shaded, "msrcr", {})],
  ];
  const table = mdTable(
    ["Image", "Left quarter luma", "Right quarter luma", "Right / left", "Saturation (%)"],
    variants.map(([label, image]) => {
      const [l, r, s] = measure(image);
      return [label, fix(l, 1), fix(r, 1), fix(r / l, 2), fix(s, 1)];
    }),
  );
  const text = (row) =>
    table +
    `\nEach row is a result with its default settings, except where the row says intensity, on the chart of the figure at full size, ${width} by ${height} pixels, lit from the left. Luma is 0.299 R + 0.587 G + 0.114 B, averaged over the left and right quarters, which hold the same patches. Saturation is (max - min) / max per pixel, averaged over the patches with color. A right / left ratio near 1 means the light is evened out. The row "${row}" is this filter.\n`;

  const shown = "shown at a quarter of its size";
  figure("retinex-ssr", {
    message: `The patch chart lit from the left, and single-scale Retinex on each channel and on the intensity, ${shown}.`,
    panels: [
      { title: "Shaded", image: color(shaded) },
      { title: "SSR", image: color(variants[1][1]) },
      { title: "SSR, intensity", image: color(variants[2][1]) },
    ],
  });
  example("retinex-ssr", text("SSR, sigma 80"));
  figure("retinex-msr", {
    message: `The patch chart lit from the left, and multi-scale Retinex on each channel and on the intensity, ${shown}.`,
    panels: [
      { title: "Shaded", image: color(shaded) },
      { title: "MSR", image: color(variants[3][1]) },
      { title: "MSR, intensity", image: color(variants[4][1]) },
    ],
  });
  example("retinex-msr", text("MSR, sigma 15, 80, 250"));
  figure("msrcr", {
    message: `The patch chart lit from the left, multi-scale Retinex, and MSRCR with color restoration, ${shown}.`,
    panels: [
      { title: "Shaded", image: color(shaded) },
      { title: "MSR", image: color(variants[3][1]) },
      { title: "MSRCR", image: color(variants[5][1]) },
    ],
  });
  example("msrcr", text("MSRCR, alpha 125"));
}
