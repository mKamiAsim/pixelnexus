// Figures and worked examples for the color adjustments of Phase 5f.
// gen-filter-docs.mjs calls colorDocs with its helpers. Every number comes from the code.

export function colorDocs(h) {
  const { run, pic, figure, example, mdTable, fix, browserFilter, createImage, hsvToRgb } = h;

  // A color chart: hue from left to right and value from top to bottom, over a gray ramp.
  const chart = createImage(180, 90);
  for (let y = 0; y < 90; y++) {
    for (let x = 0; x < 180; x++) {
      const [r, g, b] =
        y < 60
          ? hsvToRgb((360 * x) / 180, 0.6, 1 - (0.85 * y) / 59)
          : [x * (255 / 179), x * (255 / 179), x * (255 / 179)];
      chart.data.set([Math.round(r), Math.round(g), Math.round(b), 255], (y * 180 + x) * 4);
    }
  }
  const color = (image) => pic(image, true);
  const panels = (id, message, list) =>
    figure(id, {
      message,
      panels: [
        { title: "Chart", image: color(chart) },
        ...list.map(([title, params]) => ({ title, image: color(run(chart, id, params)) })),
      ],
    });

  /** The output of the real pixel function for one color, before and after clipping. */
  const out = (id, params, rgb) => {
    const result = new Float64Array(3);
    browserFilter(id).pixel(rgb[0], rgb[1], rgb[2], params, result);
    return Array.from(result);
  };
  const show = (values) => values.map((v) => fix(v, 1)).join(", ");
  const pixel = (values) => values.map((v) => Math.min(255, Math.max(0, Math.round(v)))).join(", ");
  const rows = (id, cases) =>
    mdTable(
      ["Input", "Settings", "Output", "Pixel"],
      cases.map(([rgb, label, params]) => {
        const o = out(id, params, rgb);
        return [`(${rgb.join(", ")})`, label, `(${show(o)})`, `(${pixel(o)})`];
      }),
    );

  panels(
    "bw-mix",
    "Black-and-white conversion with the default weights and with a red-filter mix.",
    [
      ["30, 59, 11", {}],
      ["70, 30, 0", { red: 70, green: 30, blue: 0 }],
    ],
  );
  example(
    "bw-mix",
    rows("bw-mix", [
      [[200, 100, 50], "30, 59, 11", {}],
      [[200, 100, 50], "70, 30, 0", { red: 70, green: 30, blue: 0 }],
      [[60, 90, 200], "70, 30, 0", { red: 70, green: 30, blue: 0 }],
    ]) +
      "\nWith the red-filter mix, the orange color gets lighter and the blue one much darker, as a blue sky does behind a red filter on black-and-white film.\n",
  );

  panels("sepia", "Sepia at amounts 50 and 100.", [
    ["Amount 50", { amount: 50 }],
    ["Amount 100", { amount: 100 }],
  ]);
  example(
    "sepia",
    rows("sepia", [
      [[255, 255, 255], "100", { amount: 100 }],
      [[128, 128, 128], "100", { amount: 100 }],
      [[128, 128, 128], "50", { amount: 50 }],
    ]) +
      "\nAt full amount, white leaves the range in red and green and clips to cream. Mid-gray turns brown, since the red row of the matrix adds up to 1.351 and the blue row to 0.937.\n",
  );

  panels("saturation", "Saturation at 50 and 200 percent.", [
    ["50 %", { saturation: 50 }],
    ["200 %", { saturation: 200 }],
  ]);
  {
    const y = (c) => 0.213 * c[0] + 0.715 * c[1] + 0.072 * c[2];
    const base = [200, 100, 50];
    example(
      "saturation",
      rows("saturation", [
        [base, "0 %", { saturation: 0 }],
        [base, "150 %", { saturation: 150 }],
        [base, "300 %", { saturation: 300 }],
      ]) +
        `\nThe gray of the input is Y = 0.213 R + 0.715 G + 0.072 B = ${fix(y(base), 2)}. At 0 percent every channel becomes Y. At 150 percent the gray of the output is still ${fix(y(out("saturation", { saturation: 150 }, base)), 2)}, and each channel moves 1.5 times as far from it.\n`,
    );
  }

  panels("vibrance", "Vibrance at 100 and at -100.", [
    ["Vibrance 100", { vibrance: 100 }],
    ["Vibrance -100", { vibrance: -100 }],
  ]);
  example(
    "vibrance",
    rows("vibrance", [
      [[150, 130, 120], "100", { vibrance: 100 }],
      [[230, 40, 30], "100", { vibrance: 100 }],
      [[150, 130, 120], "-100", { vibrance: -100 }],
    ]) +
      "\nThe muted color has saturation S = (150 - 120) / 150 = 0.2, so its factor is 1 + 1 x 0.8 = 1.8. The vivid red has S = 0.87, so its factor is only 1.13 and it barely changes.\n",
  );

  panels("hue-rotate", "Hue rotation by 90 and by 180 degrees.", [
    ["90 degrees", { angle: 90 }],
    ["180 degrees", { angle: 180 }],
  ]);
  example(
    "hue-rotate",
    rows("hue-rotate", [
      [[255, 0, 0], "120 degrees", { angle: 120 }],
      [[128, 128, 128], "120 degrees", { angle: 120 }],
      [[200, 100, 50], "180 degrees", { angle: 180 }],
    ]) +
      "\nPure red turned by 120 degrees moves toward green, but the result is not pure green, and some channels leave the range. Gray stays gray.\n",
  );

  panels(
    "hsv-adjust",
    "HSV adjustment: a hue shift of 90 degrees, and saturation 40 percent with value 120 percent.",
    [
      ["Hue + 90", { hue: 90, saturation: 100, value: 100 }],
      ["S 40, V 120", { hue: 0, saturation: 40, value: 120 }],
    ],
  );
  example(
    "hsv-adjust",
    rows("hsv-adjust", [
      [[200, 100, 50], "hue + 120", { hue: 120, saturation: 100, value: 100 }],
      [[200, 100, 50], "saturation 50", { hue: 0, saturation: 50, value: 100 }],
      [[200, 100, 50], "value 150", { hue: 0, saturation: 100, value: 150 }],
    ]) +
      "\nThe input has hue 20 degrees, saturation 0.75 and value 200 / 255 = 0.78. A hue shift of 120 degrees gives hue 140, a green, with the same saturation and value. Value 150 percent would give 1.18, so it is capped at 1 and the largest channel becomes 255.\n",
  );

  const swap = {
    redFromRed: 0,
    redFromBlue: 100,
    blueFromBlue: 0,
    blueFromRed: 100,
  };
  panels("channel-mixer", "The channel mixer with red and blue swapped.", [
    ["Red and blue swapped", swap],
  ]);
  example(
    "channel-mixer",
    rows("channel-mixer", [
      [[200, 100, 50], "red and blue swapped", swap],
      [[200, 100, 50], "red from green 50, red from red 50", { redFromRed: 50, redFromGreen: 50 }],
    ]) + "\nEach output channel is a weighted sum of the inputs, with weights in percent.\n",
  );

  const teal = {
    midtonesCyanRed: 0,
    midtonesYellowBlue: 0,
    shadowsCyanRed: -30,
    shadowsYellowBlue: 30,
    highlightsCyanRed: 30,
    highlightsYellowBlue: -30,
  };
  panels(
    "color-balance",
    "Color balance: warm midtones, the default, and teal shadows with orange highlights.",
    [
      ["Warm midtones", {}],
      ["Teal and orange", teal],
    ],
  );
  example(
    "color-balance",
    rows("color-balance", [
      [[40, 40, 40], "teal and orange", { ...teal, preserveLuminosity: false }],
      [[128, 128, 128], "teal and orange", { ...teal, preserveLuminosity: false }],
      [[220, 220, 220], "teal and orange", { ...teal, preserveLuminosity: false }],
      [[220, 220, 220], "teal and orange, preserve luminosity", teal],
    ]) +
      "\nThree grays with lightness 0.16, 0.50 and 0.86. The dark gray is fully in the shadow mask, which is 0.7 there, so red would drop by 0.7 x 0.3 x 255 = 53.6, which clips it to 0, and blue rises by 53.6. The middle gray is in the midtone mask only, which has no shifts here, so it does not change. The light gray gets the highlight shifts. With Preserve luminosity, the light gray keeps its HSL lightness, so its channels spread around the old level.\n",
  );
}
