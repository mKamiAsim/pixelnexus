// Figures and worked examples for demosaicing and the color threshold.
// gen-filter-docs.mjs calls cfaDocs with its helpers. Every number comes from the code.

export function cfaDocs(h) {
  const { run, pic, figure, example, mdTable, fix, createImage, hsvToRgb, synthetic } = h;
  const color = (image) => pic(image, true);

  // Demosaicing: a gray Siemens star on the left, color patches on the right.
  {
    const size = 120;
    const width = 2 * size;
    const star = synthetic.siemensStar(size, size);
    const scene = createImage(width, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        if (x < size) {
          const v = star.data[(y * size + x) * 4];
          scene.data.set([v, v, v, 255], o);
        } else {
          const saturation = [0.8, 0.5][Math.floor((x - size) / 15) % 2];
          const rgb = hsvToRgb(60 * Math.floor(y / 20), saturation, 0.9);
          scene.data.set([...rgb.map(Math.round), 255], o);
        }
      }
    }
    // PSNR over all three channels without the 2 pixels at the edge, and the false color of the
    // star half: the mean of |R - G| + |B - G| where the original is gray.
    const measure = (image) => {
      let squares = 0;
      let n = 0;
      let falseColor = 0;
      let m = 0;
      for (let y = 2; y < size - 2; y++) {
        for (let x = 2; x < width - 2; x++) {
          const o = (y * width + x) * 4;
          for (let c = 0; c < 3; c++) {
            squares += (image.data[o + c] - scene.data[o + c]) ** 2;
            n++;
          }
          if (x < size - 2) {
            const [r, g, b] = [image.data[o], image.data[o + 1], image.data[o + 2]];
            falseColor += Math.abs(r - g) + Math.abs(b - g);
            m++;
          }
        }
      }
      return [10 * Math.log10((255 * 255) / (squares / n)), falseColor / m];
    };
    const rows = [
      ["Bilinear", run(scene, "demosaic", { method: "bilinear" })],
      ["Malvar, He and Cutler", run(scene, "demosaic", {})],
    ];
    figure("demosaic", {
      message:
        "A gray Siemens star and color patches, their RGGB mosaic, and bilinear and Malvar-He-Cutler demosaicing.",
      panels: [
        { title: "Original", image: color(scene) },
        { title: "Mosaic", image: color(run(scene, "demosaic", { output: "mosaic" })) },
        { title: "Bilinear", image: color(rows[0][1]) },
        { title: "Malvar-He-Cutler", image: color(rows[1][1]) },
      ],
    });
    example(
      "demosaic",
      mdTable(
        ["Method", "PSNR (dB)", "False color in the star"],
        rows.map(([label, image]) => {
          const [psnr, falseColor] = measure(image);
          return [label, fix(psnr, 2), fix(falseColor, 2)];
        }),
      ) +
        `\nThe image of the figure, ${width} by ${size} pixels, through an RGGB mosaic and back. The PSNR compares all three channels with the original, without the 2 pixels next to the edge. The false color is the mean of |R - G| + |B - G| over the star, which is gray in the original, so every bit of it is an error.\n`,
    );
  }

  // Color threshold: the hue sweep, with the default red range and a green range.
  {
    const width = 180;
    const height = 60;
    const sweep = synthetic.hueSweep(width, height);
    const share = (image) => {
      let white = 0;
      for (let i = 0; i < width * height; i++) if (image.data[i * 4] > 127) white++;
      return (100 * white) / (width * height);
    };
    const settings = [
      ["Red, 330 to 30 degrees", {}],
      ["Green, 90 to 150 degrees", { hueMin: 90, hueMax: 150 }],
      ["Green, saturation at least 70 %", { hueMin: 90, hueMax: 150, satMin: 70 }],
    ];
    const results = settings.map(([label, params]) => [
      label,
      run(sweep, "color-threshold", params),
    ]);
    figure("color-threshold", {
      message:
        "The hue sweep, with hue across and saturation falling downward, and the masks for the red range and for the green range.",
      panels: [
        { title: "Hue sweep", image: color(sweep) },
        { title: "Red", image: pic(results[0][1]) },
        { title: "Green", image: pic(results[1][1]) },
      ],
    });
    example(
      "color-threshold",
      mdTable(
        ["Setting", "Selected (%)"],
        results.map(([label, image]) => [label, fix(share(image), 1)]),
      ) +
        `\nThe hue sweep of the figure, ${width} by ${height} pixels: hue from 0 to 360 degrees across, saturation from 100 % at the top to 0 at the bottom, value 100 %. The settings not named are the defaults: saturation from 40 % and value from 30 %. A 60 degree range is a sixth of the hues, and saturation from 40 % keeps the top 60 % of the rows, so about 10 % of the image is selected.\n`,
    );
  }
}
