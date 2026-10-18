// Figures and worked examples for AHE and CLAHE.
// gen-filter-docs.mjs calls claheDocs with its helpers. Every number comes from the code.

export function claheDocs(h) {
  const { run, pic, figure, example, mdTable, fix, synthetic, tileCurves } = h;

  // Blurred disks pressed into the values 90 to 150, with faint noise.
  const disks = synthetic.disks(160, 160);
  const soft = run(run(disks, "gaussian", { sigma: 6 }), "contrast-stretch", {
    r1: 0,
    s1: 90,
    r2: 255,
    s2: 150,
  });
  const noisy = run(soft, "noise-gaussian", { sigma: 1.5, seed: 9, monochrome: true });
  const rgb = { channelScope: "rgb" };
  const ahe = run(noisy, "ahe", { tilesX: 8, tilesY: 8, ...rgb });
  const clahe = run(noisy, "clahe", { tilesX: 8, tilesY: 8, clipLimit: 2, ...rgb });
  const equalized = run(noisy, "histogram-eq", rgb);

  figure("ahe", {
    message:
      "Low-contrast disks with faint noise, after AHE and after CLAHE, both with 8 x 8 tiles.",
    panels: [
      { title: "Low contrast", image: pic(noisy) },
      { title: "AHE", image: pic(ahe) },
      { title: "CLAHE, clip 2", image: pic(clahe) },
    ],
  });
  figure("clahe", {
    message: "Low-contrast disks with faint noise, after histogram equalization and after CLAHE.",
    panels: [
      { title: "Low contrast", image: pic(noisy) },
      { title: "Equalized", image: pic(equalized) },
      { title: "CLAHE, clip 2", image: pic(clahe) },
    ],
  });

  // The spread of a flat patch of background, x 100 to 129 and y 135 to 154.
  const spread = (image) => {
    const values = [];
    for (let y = 135; y < 155; y++) {
      for (let x = 100; x < 130; x++) values.push(image.data[(y * image.width + x) * 4]);
    }
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  };
  example(
    "ahe",
    mdTable(
      ["Image", "Input", "Histogram equalization", "CLAHE, clip 2", "AHE"],
      [["Standard deviation", ...[noisy, equalized, clahe, ahe].map((i) => fix(spread(i), 2))]],
    ) +
      "\nThe standard deviation of a flat patch of background, 30 by 20 pixels, in the image of the figure. Before the filters it is only noise. Global equalization stretches it a lot, since most pixels of the image are background. AHE stretches it the most, since the tiles in flat areas have one tall histogram bin and so a very steep curve. The clip limit of CLAHE caps that slope.\n",
  );

  // The tile curves of the figure image: the clip level and the steepest step of any curve.
  const plane = {
    width: noisy.width,
    height: noisy.height,
    data: Float32Array.from({ length: noisy.width * noisy.height }, (_, i) => noisy.data[i * 4]),
  };
  const steepest = (clip) => {
    const { luts, tilesX, tilesY } = tileCurves(plane, 8, 8, clip);
    let top = 0;
    for (let t = 0; t < tilesX * tilesY; t++) {
      for (let k = 1; k < 256; k++) top = Math.max(top, luts[t * 256 + k] - luts[t * 256 + k - 1]);
    }
    return top;
  };
  const limits = [1, 2, 4, 40];
  const tilePixels = 20 * 20;
  example(
    "clahe",
    mdTable(
      ["Clip limit c", ...limits.map(String), "none (AHE)"],
      [
        [
          "beta",
          ...limits.map((c) => String(Math.max(1, Math.floor((c * tilePixels) / 256)))),
          "none",
        ],
        ["Steepest step", ...limits.map((c) => String(steepest(c))), String(steepest(0))],
      ],
    ) +
      "\nThe image of the figure is 160 by 160 pixels, so 8 x 8 tiles hold M = 400 pixels each. beta is the largest count a bin may keep. The steepest step is the largest jump between neighboring levels in any tile curve, in output levels. A jump of 1 keeps contrast as it is. Without a limit, a crowded level can jump by dozens of levels.\n",
  );
}
