// Figures and worked examples for the point operations of Phase 5f.
// gen-filter-docs.mjs calls pointOpsDocs with its helpers. Every number comes from the code.

export function pointOpsDocs(h) {
  const { run, pic, figure, example, mdTable, fix, synthetic, browserFilter, histogramPercentile } =
    h;
  const levels = Array.from({ length: 256 }, (_, v) => v);
  const curveOf = (id, params) => browserFilter(id).representation(params).values;
  const square = (lines) => ({
    x: levels,
    xlabel: "Input value",
    ylabel: "Output value",
    square: true,
    lines,
  });
  const table = (id, params, inputs, label) => {
    const curve = curveOf(id, params);
    return mdTable(
      ["Input", ...inputs.map(String)],
      [
        [label, ...inputs.map((v) => fix(curve[v], 2))],
        ["Pixel", ...inputs.map((v) => String(Math.round(curve[v])))],
      ],
    );
  };

  figure("log-transform", {
    message: "The log curve lifts the dark values far more than the bright ones.",
    profile: square([
      { label: "log transformation", values: curveOf("log-transform", {}) },
      { label: "no change", values: levels },
    ]),
  });
  example(
    "log-transform",
    table("log-transform", {}, [0, 1, 8, 32, 128, 255], "c ln(1 + I)") +
      "\nThe levels 0 to 32 spread over the outputs 0 to 161, while the top half, 128 to 255, shares the outputs 223 to 255.\n",
  );

  const stretch = { r1: 64, s1: 32, r2: 192, s2: 224 };
  figure("contrast-stretch", {
    message: "Two contrast stretching curves: the default control points, and a threshold at 128.",
    profile: square([
      { label: "(64, 32) and (192, 224)", values: curveOf("contrast-stretch", stretch) },
      {
        label: "threshold at 128",
        values: curveOf("contrast-stretch", { r1: 128, s1: 0, r2: 128, s2: 255 }),
      },
    ]),
  });
  example(
    "contrast-stretch",
    table("contrast-stretch", stretch, [0, 32, 64, 128, 192, 224, 255], "T(I)") +
      "\nWith the default control points, the middle segment has slope (224 - 32) / (192 - 64) = 1.5, so the midtones gain contrast. The outer segments have slope 0.5 and press the shadows and highlights together.\n",
  );

  const disks = synthetic.disks(160, 160);
  figure("invert", {
    message: "Disks and their negative.",
    panels: [
      { title: "Disks", image: pic(disks) },
      { title: "Inverted", image: pic(run(disks, "invert", {})) },
    ],
  });
  example(
    "invert",
    table("invert", {}, [0, 30, 128, 220, 255], "255 - I") +
      "\nThe disks of the figure have value 220 on a background of 30, so they become 35 on 225.\n",
  );

  const ramp = synthetic.ramp(160, 60);
  figure("posterize", {
    message: "A gray ramp posterized to 4 and to 8 levels.",
    panels: [
      { title: "Gray ramp", image: pic(ramp) },
      { title: "4 levels", image: pic(run(ramp, "posterize", { levels: 4 })) },
      { title: "8 levels", image: pic(run(ramp, "posterize", { levels: 8 })) },
    ],
  });
  example(
    "posterize",
    table("posterize", { levels: 4 }, [0, 63, 64, 127, 128, 191, 192, 255], "4 levels") +
      "\nWith 4 levels, the bins are 64 values wide: 0 to 63, 64 to 127, 128 to 191 and 192 to 255. They map to 0, 85, 170 and 255.\n",
  );

  figure("solarize", {
    message: "Solarize curves with thresholds 128 and 64.",
    profile: square([
      { label: "threshold 128", values: curveOf("solarize", { threshold: 128 }) },
      { label: "threshold 64", values: curveOf("solarize", { threshold: 64 }) },
    ]),
  });
  example(
    "solarize",
    table("solarize", { threshold: 128 }, [0, 64, 127, 128, 192, 255], "threshold 128") +
      "\nValues up to 127 stay. From 128 on, the curve falls: 128 becomes 127 and 255 becomes 0.\n",
  );

  // A low-contrast image: blurred disks pressed into the range 90 to 150.
  const soft = run(run(disks, "gaussian", { sigma: 6 }), "contrast-stretch", {
    r1: 0,
    s1: 90,
    r2: 255,
    s2: 150,
  });
  figure("histogram-eq", {
    message:
      "Blurred disks pressed into the values 90 to 150, and the same image after histogram equalization.",
    panels: [
      { title: "Low contrast", image: pic(soft) },
      { title: "Equalized", image: pic(run(soft, "histogram-eq", { channelScope: "rgb" })) },
    ],
  });
  {
    const values = [50, 50, 50, 50, 100, 100, 150, 200];
    const counts = new Float64Array(256);
    for (const v of values) counts[v] += 1;
    const t = browserFilter("histogram-eq").pointTable({}, counts);
    const shown = [50, 100, 150, 200];
    example(
      "histogram-eq",
      mdTable(
        ["Level k", ...shown.map(String)],
        [
          ["Pixels h_k", ...shown.map((k) => String(counts[k]))],
          ["Running total", ...shown.map((k) => String(values.filter((v) => v <= k).length))],
          ["T(k)", ...shown.map((k) => fix(t[k], 2))],
        ],
      ) +
        "\nAn image of 8 pixels. Half of them sit at level 50, so the curve jumps to 255 times 4 / 8 = 127.5 there. Each level after that adds its share of the pixels. The most crowded level gets the biggest step.\n",
    );
  }

  const specks = run(soft, "noise-salt-pepper", { amount: 0.002, seed: 4 });
  figure("percentile-normalize", {
    message:
      "A low-contrast image with a few black and white specks, stretched by min-max and by percentiles.",
    panels: [
      { title: "With specks", image: pic(specks) },
      {
        title: "0 and 100",
        image: pic(run(specks, "percentile-normalize", { low: 0, high: 100, channelScope: "rgb" })),
      },
      {
        title: "1 and 99",
        image: pic(run(specks, "percentile-normalize", { low: 1, high: 99, channelScope: "rgb" })),
      },
    ],
  });
  {
    const counts = new Float64Array(256);
    for (let i = 0; i < specks.data.length; i += 4) counts[specks.data[i]] += 1;
    const pairs = [
      [0, 100],
      [0.5, 99.5],
      [1, 99],
      [5, 95],
    ];
    example(
      "percentile-normalize",
      mdTable(
        ["Percentiles", ...pairs.map(([a, b]) => `${a} and ${b}`)],
        [
          ["p_lo", ...pairs.map(([a]) => fix(histogramPercentile(counts, a), 2))],
          ["p_hi", ...pairs.map(([, b]) => fix(histogramPercentile(counts, b), 2))],
        ],
      ) +
        "\nThe percentiles of the speckled image of the figure. The specks are pure black and white, so min-max normalization finds 0 and 255 and changes nothing. From 0.5 and 99.5 on, the specks fall outside the percentiles, and the stretch works on the real range of the image.\n",
    );
  }
}
