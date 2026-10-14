// Figures and worked examples for bilateral tone mapping, detail enhancement and chroma
// denoising. gen-filter-docs.mjs calls toneDocs with its helpers. Every number comes from the code.

export function toneDocs(h) {
  const { run, pic, figure, example, mdTable, fix, createImage, hsvToRgb } = h;
  const toLinear = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const toSrgb = (v) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
  const color = (image) => pic(image, true);
  const lumaAt = (image, i) =>
    0.299 * image.data[i * 4] + 0.587 * image.data[i * 4 + 1] + 0.114 * image.data[i * 4 + 2];

  // Tone mapping: patches of six hues and three saturations, the left half in full light and the
  // right half in a shadow that lets 3 percent of the light through, applied in linear light.
  {
    const width = 240;
    const height = 120;
    const scene = createImage(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const saturation = [0.8, 0.5, 0][Math.floor((x % 60) / 20)];
        const rgb = hsvToRgb(60 * Math.floor(y / 20), saturation, 0.9);
        const light = x < width / 2 ? 1 : 0.03;
        const out = rgb.map((v) => Math.round(toSrgb(toLinear(v) * light)));
        scene.data.set([...out, 255], (y * width + x) * 4);
      }
    }
    // Mean luma of each half, leaving out 10 columns on each side of the shadow edge.
    const halves = (image) => {
      let lit = 0;
      let shade = 0;
      let n = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < 110; x++) {
          lit += lumaAt(image, y * width + x);
          shade += lumaAt(image, y * width + x + 130);
          n++;
        }
      }
      return [lit / n, shade / n];
    };
    const rows = [
      ["Scene", scene],
      ["Base contrast 3", run(scene, "bilateral-tonemap", { contrast: 3 })],
      ["Base contrast 5", run(scene, "bilateral-tonemap", {})],
      ["Base contrast 10", run(scene, "bilateral-tonemap", { contrast: 10 })],
    ];
    figure("bilateral-tonemap", {
      message:
        "A scene with its right half in deep shadow, and after bilateral tone mapping with base contrast 5.",
      panels: [
        { title: "Scene", image: color(scene) },
        { title: "Tone mapped", image: color(rows[2][1]) },
      ],
    });
    example(
      "bilateral-tonemap",
      mdTable(
        ["Image", "Lit half luma", "Shaded half luma"],
        rows.map(([label, image]) => {
          const [lit, shade] = halves(image);
          return [label, fix(lit, 1), fix(shade, 1)];
        }),
      ) +
        `\nThe scene of the figure, ${width} by ${height} pixels: patches in full light on the left, and the same patches in a shadow that lets 3 percent of the light through on the right. Luma is 0.299 R + 0.587 G + 0.114 B of the encoded values, averaged over each half without the 10 columns next to the shadow edge. The other settings are the defaults.\n`,
    );
  }

  // Detail enhancement: a step from 60 to 180 with fine texture of plus or minus 6 everywhere.
  {
    const width = 160;
    const height = 100;
    const texture = (x, y) => (((x * 7 + y * 13) % 5) - 2) * 3;
    const step = createImage(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = (x < width / 2 ? 60 : 180) + texture(x, y);
        step.data.set([v, v, v, 255], (y * width + x) * 4);
      }
    }
    const value = (image, x, y) => image.data[(y * width + x) * 4];
    // The texture amplitude far from the edge: the standard deviation of the value minus its
    // plateau, in columns 10 to 39. And the mean of the 3 columns on each side of the edge.
    const measure = (image) => {
      let sum = 0;
      let squares = 0;
      let n = 0;
      let left = 0;
      let right = 0;
      let m = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 10; x < 40; x++) {
          const d = value(image, x, y);
          sum += d;
          squares += d * d;
          n++;
        }
        for (let k = 1; k <= 3; k++) {
          left += value(image, width / 2 - k, y);
          right += value(image, width / 2 - 1 + k, y);
          m++;
        }
      }
      const mean = sum / n;
      return [Math.sqrt(squares / n - mean * mean), left / m, right / m];
    };
    const rows = [
      ["Input", step],
      ["Guided base, boost 5", run(step, "detail-enhance", { channelScope: "rgb" })],
      [
        "Bilateral base, boost 5",
        run(step, "detail-enhance", { base: "bilateral", channelScope: "rgb" }),
      ],
    ];
    figure("detail-enhance", {
      message:
        "A step with fine texture, and the detail boosted 5 times over a guided and a bilateral base.",
      panels: rows.map(([label, image]) => ({ title: label.split(",")[0], image: pic(image) })),
    });
    example(
      "detail-enhance",
      mdTable(
        ["Image", "Texture deviation", "Mean left of the edge", "Mean right of the edge"],
        rows.map(([label, image]) => {
          const [deviation, left, right] = measure(image);
          return [label, fix(deviation, 2), fix(left, 1), fix(right, 1)];
        }),
      ) +
        `\nThe step of the figure, ${width} by ${height} pixels, from 60 to 180, with a fine pattern of steps of 3 between -6 and 6 everywhere. The texture deviation is the standard deviation in columns 10 to 39, far from the edge. The edge means average the 3 columns on each side of the edge, where the input means are about 60 and 180. Values past 0 or 255 are clipped. The other settings are the defaults: r = 16 and eps = 0.01 for the guided base, sigma_s = 16 and sigma_r = 25.5 for the bilateral one.\n`,
    );
  }

  // Chroma denoising: the patch chart with color noise of sigma 12, seed 41.
  {
    const width = 180;
    const height = 120;
    const clean = createImage(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const saturation = [0.8, 0.5, 0][Math.floor((x % 60) / 20)];
        const rgb = hsvToRgb(60 * Math.floor(y / 20), saturation, 0.9);
        clean.data.set([...rgb.map(Math.round), 255], (y * width + x) * 4);
      }
    }
    const noisy = run(clean, "noise-gaussian", { sigma: 12, seed: 41 });
    const split = (image, i) => {
      const [r, g, b] = [image.data[i * 4], image.data[i * 4 + 1], image.data[i * 4 + 2]];
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      return [y, 128 + (b - y) / 1.772, 128 + (r - y) / 1.402];
    };
    // Root mean square errors against the clean chart, in luma and in chroma (Cb and Cr together).
    const errors = (image) => {
      let luma = 0;
      let chroma = 0;
      const n = width * height;
      for (let i = 0; i < n; i++) {
        const [y0, b0, r0] = split(clean, i);
        const [y1, b1, r1] = split(image, i);
        luma += (y1 - y0) ** 2;
        chroma += ((b1 - b0) ** 2 + (r1 - r0) ** 2) / 2;
      }
      return [Math.sqrt(luma / n), Math.sqrt(chroma / n)];
    };
    const rows = [
      ["Noisy", noisy],
      ["Median, 5 x 5", run(noisy, "chroma-denoise", {})],
      ["Gaussian, sigma 2", run(noisy, "chroma-denoise", { method: "gaussian", sigma: 2 })],
    ];
    figure("chroma-denoise", {
      message: "The patch chart with color noise, and after chroma denoising with a 5 x 5 median.",
      panels: [
        { title: "Clean", image: color(clean) },
        { title: "Noisy", image: color(noisy) },
        { title: "Chroma denoised", image: color(rows[1][1]) },
      ],
    });
    example(
      "chroma-denoise",
      mdTable(
        ["Image", "Luma error", "Chroma error"],
        rows.map(([label, image]) => {
          const [luma, chroma] = errors(image);
          return [label, fix(luma, 2), fix(chroma, 2)];
        }),
      ) +
        `\nThe patch chart of the figure, ${width} by ${height} pixels, with Gaussian noise of sigma 12 in each channel (seed 41). The errors are root mean square differences from the clean chart, in BT.601 luma and in Cb and Cr together. Chroma denoising keeps luma, so the luma error stays, apart from rounding and clipping to whole levels.\n`,
    );
  }
}
