// Figures and worked examples for the global and local thresholds.
// gen-filter-docs.mjs calls thresholdDocs with its helpers. Every number comes from the code.

export function thresholdDocs(h) {
  const { run, pic, figure, example, mdTable, fix, createImage } = h;

  // A page lit from the right: the background rises from 60 to 220, and dark strokes sit at
  // 45 percent of the background. Light noise from a fixed pattern.
  const width = 160;
  const height = 120;
  const page = createImage(width, height);
  const stroke = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const line = y % 20;
      const isStroke =
        (line >= 8 && line < 11 && x % 24 < 18) || (line >= 4 && line < 15 && x % 24 === 3);
      stroke[y * width + x] = isStroke ? 1 : 0;
      const background = 60 + (160 * x) / (width - 1);
      const noise = (((x * 37 + y * 101) % 13) - 6) * 0.8;
      const v = Math.round((isStroke ? 0.45 * background : background) + noise);
      page.data.set([v, v, v, 255], (y * width + x) * 4);
    }
  }

  const settings = {
    "threshold-global": [{}, "Global, t = 128"],
    otsu: [{}, "Otsu"],
    "threshold-adaptive-mean": [{}, "Adaptive mean, 15 px, C = 5"],
    "threshold-adaptive-gaussian": [{}, "Adaptive Gaussian, 15 px, C = 5"],
    niblack: [{}, "Niblack, 15 px, k = -0.2"],
    sauvola: [{}, "Sauvola, 15 px, k = 0.5, R = 128"],
    wolf: [{}, "Wolf, 15 px, k = 0.5"],
    bradley: [{}, "Bradley, 15 px, t = 15"],
  };
  const score = (image) => {
    let strokes = 0;
    let strokeRight = 0;
    let background = 0;
    let backgroundRight = 0;
    for (let i = 0; i < width * height; i++) {
      const white = image.data[i * 4] > 127;
      if (stroke[i]) {
        strokes++;
        if (!white) strokeRight++;
      } else {
        background++;
        if (white) backgroundRight++;
      }
    }
    return [(100 * strokeRight) / strokes, (100 * backgroundRight) / background];
  };
  const results = Object.fromEntries(
    Object.entries(settings).map(([id, [params]]) => [
      id,
      run(page, id, { ...params, channelScope: "rgb" }),
    ]),
  );
  const table = mdTable(
    ["Method", "Strokes black (%)", "Background white (%)"],
    Object.entries(settings).map(([id, [, label]]) => {
      const [s, b] = score(results[id]);
      return [label, fix(s, 1), fix(b, 1)];
    }),
  );
  for (const [id, [, label]] of Object.entries(settings)) {
    figure(id, {
      message: `${label} on a page lit from the right.`,
      panels: [
        { title: "Page", image: pic(page) },
        { title: label.split(",")[0], image: pic(results[id]) },
      ],
    });
    example(
      id,
      table +
        `\nAll eight methods with their default settings on the page of the figure, ${width} by ${height} pixels. The background brightness rises from 60 at the left to 220 at the right, and the strokes are 45 percent of it. A stroke pixel is right when it is black, and a background pixel is right when it is white. The row "${label}" is this filter.\n`,
    );
  }
}
