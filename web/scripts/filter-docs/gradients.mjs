// Figures and worked examples for the Phase 5c gradient, compass, line and texture filters.
// gen-filter-docs.mjs calls gradientDocs with its helpers. Every number comes from the filter code.

export function gradientDocs(h) {
  const { run, pic, figure, example, planeAt, matrix, block, mdTable, fix, synthetic } = h;
  const { createImage, compassMasks, LAWS_VECTORS } = h;

  const lum = (image, id, params = {}) =>
    run(image, id, { channelScope: "luminance", outputMapping: "normalize", ...params });
  const disks = synthetic.disks(96, 96);
  const star = synthetic.siemensStar(96, 96, 24);
  const noisy = run(disks, "noise-gaussian", { sigma: 10, monochrome: true, seed: 61 });

  figure("prewitt", {
    message: "Prewitt and Sobel give almost the same edges. Sobel weights the middle row more.",
    panels: [
      { title: "Disks", image: pic(disks) },
      { title: "Prewitt magnitude", image: pic(lum(disks, "prewitt")) },
      { title: "Sobel magnitude", image: pic(lum(disks, "sobel")) },
    ],
  });
  figure("scharr", {
    message: "The Scharr magnitude is nearly the same for spokes in every direction.",
    panels: [
      { title: "Siemens star", image: pic(star) },
      { title: "Scharr magnitude", image: pic(lum(star, "scharr")) },
    ],
  });
  figure("roberts", {
    message: "Roberts has no smoothing, so it finds thin edges but also every noisy pixel.",
    panels: [
      { title: "Noise, sigma 10", image: pic(noisy) },
      { title: "Roberts", image: pic(lum(noisy, "roberts")) },
      { title: "Sobel", image: pic(lum(noisy, "sobel")) },
    ],
  });
  figure("farid-simoncelli", {
    message: "The 5-tap Farid kernels give smooth, even edge strength around the star.",
    panels: [
      { title: "Siemens star", image: pic(star) },
      { title: "Farid magnitude", image: pic(lum(star, "farid-simoncelli")) },
    ],
  });
  for (const id of ["kirsch", "robinson"]) {
    figure(id, {
      message:
        "The largest response marks the edges. The direction map has eight values, one per mask.",
      panels: [
        { title: "Disks", image: pic(disks) },
        { title: "Largest response", image: pic(lum(disks, id)) },
        { title: "Direction", image: pic(lum(disks, id, { output: "direction" })) },
      ],
    });
  }
  figure("frei-chen", {
    message: "The edge subspace lights up on the disk borders, the line subspace on the thin dots.",
    panels: [
      { title: "Disks", image: pic(disks) },
      {
        title: "Edge subspace",
        image: pic(run(disks, "frei-chen", { channelScope: "luminance" })),
      },
      {
        title: "Line subspace",
        image: pic(run(disks, "frei-chen", { output: "line", channelScope: "luminance" })),
      },
    ],
  });

  // Thin bright lines in four directions, for the line detector.
  const lines = createImage(96, 96);
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 96; x++) {
      const on = y === 20 || x === 70 || (x === y && x < 60) || (x + y === 120 && x < 50);
      const v = on ? 210 : 50;
      lines.data.set([v, v, v, 255], (y * 96 + x) * 4);
    }
  }
  figure("line-detector", {
    message:
      "The horizontal mask finds only the horizontal line. The strongest of the four finds all of them.",
    panels: [
      { title: "Lines", image: pic(lines) },
      {
        title: "Horizontal mask",
        image: pic(lum(lines, "line-detector", { output: "horizontal", outputMapping: "clip" })),
      },
      {
        title: "Strongest of four",
        image: pic(lum(lines, "line-detector", { outputMapping: "clip" })),
      },
    ],
  });
  const patches = synthetic.noisePatches(96, 96);
  figure("laws", {
    message: "Different masks pick out different textures. Salt and pepper is strong in both maps.",
    panels: [
      { title: "Noise patches", image: pic(patches) },
      {
        title: "E5L5 energy",
        image: pic(lum(patches, "laws", { vertical: "E5", horizontal: "L5", window: 9 })),
      },
      {
        title: "S5S5 energy",
        image: pic(lum(patches, "laws", { vertical: "S5", horizontal: "S5", window: 9 })),
      },
    ],
  });

  // Worked examples ------------------------------------------------------------------------

  const W = [
    [20, 20, 200],
    [20, 20, 200],
    [20, 20, 200],
  ];
  const window = block(`W = ${matrix(W)}`);
  const pairExample = (id, xName, yName, extra) => {
    const at = (output) => planeAt(id, W, { output }, 1, 1);
    example(
      id,
      window +
        `\nThe window lies on a vertical edge, dark on the left and bright on the right.\n\n` +
        mdTable(
          ["Output", "Value"],
          [
            [xName, fix(at("gx"))],
            [yName, fix(at("gy"))],
            ["Magnitude (L2)", fix(at("magnitude"))],
          ],
        ) +
        `\n${extra}\n`,
    );
  };
  pairExample(
    "prewitt",
    "Gx",
    "Gy",
    "Gx = (200 - 20) x (1 + 1 + 1) = 540. The three rows count equally. Sobel gives 720 here, because it weights the middle row by 2.",
  );
  pairExample(
    "scharr",
    "Gx",
    "Gy",
    "Gx = (200 - 20) x (3 + 10 + 3) = 2880. The large weights make the values large, so the output mapping scales them.",
  );
  pairExample(
    "roberts",
    "R1",
    "R2",
    "R1 is the center 20 minus the pixel below right, 200, which is -180. R2 is the right neighbor 200 minus the pixel below, 20, which is 180.",
  );
  pairExample(
    "farid-simoncelli",
    "Gx",
    "Gy",
    "Only the 3x3 middle of the 5x5 kernels is shown here. The filter reads a 5x5 window, which repeats the edge pattern by the reflect 101 border on this small example.",
  );

  const responses = compassMasks([
    [5, 5, 5],
    [-3, 0, -3],
    [-3, -3, -3],
  ]).map((m) => m.flat().reduce((s, w, i) => s + w * W.flat()[i], 0));
  const names = ["N", "NW", "W", "SW", "S", "SE", "E", "NE"];
  example(
    "kirsch",
    window +
      `\nThe eight Kirsch responses for this window:\n\n` +
      mdTable(names, [responses.map((r) => fix(r, 0))]) +
      `\nThe largest, ${Math.max(...responses)}, comes from the east mask, whose 5s lie on the bright right column. The filter gives **${fix(planeAt("kirsch", W, {}, 1, 1), 0)}** and the direction ${fix(planeAt("kirsch", W, { output: "direction" }, 1, 1), 0)} degrees, pointing right, from dark to bright.\n`,
  );
  const rob = compassMasks([
    [1, 2, 1],
    [0, 0, 0],
    [-1, -2, -1],
  ]).map((m) => m.flat().reduce((s, w, i) => s + w * W.flat()[i], 0));
  example(
    "robinson",
    window +
      `\nThe eight Robinson responses for this window:\n\n` +
      mdTable(names, [rob.map((r) => fix(r, 0))]) +
      `\nThe east mask is the Sobel K_x kernel, so its response, ${fix(Math.max(...rob), 0)}, equals the Sobel Gx. The west mask gives the negative. The filter keeps **${fix(planeAt("robinson", W, {}, 1, 1), 0)}**.\n`,
  );
  const edgeOut = planeAt("frei-chen", W, {}, 1, 1);
  const lineOut = planeAt("frei-chen", W, { output: "line" }, 1, 1);
  const share = edgeOut ** 2 / (edgeOut ** 2 + lineOut ** 2);
  example(
    "frei-chen",
    window +
      `\nThe window is a vertical step. The filter gives **${fix(edgeOut, 1)}** for the edge output, 255 times the cosine of the angle to the edge subspace, and ${fix(lineOut, 1)} for the line output. The mean mask holds the rest of the energy, ${fix(100 * (1 - (edgeOut ** 2 + lineOut ** 2) / 255 ** 2), 0)} percent, because the window is bright on average. Of the energy outside the mean, the edge subspace holds ${fix(100 * share, 0)} percent.\n`,
  );
  const L = [
    [50, 50, 50],
    [210, 210, 210],
    [50, 50, 50],
  ];
  example(
    "line-detector",
    block(`W = ${matrix(L)}`) +
      `\nA bright horizontal line one pixel wide. The horizontal mask gives 2 x 3 x 210 - 6 x 50 = **${fix(planeAt("line-detector", L, { output: "horizontal" }, 1, 1), 0)}**. The vertical mask gives ${fix(planeAt("line-detector", L, { output: "vertical" }, 1, 1), 0)}, because each of its rows adds up to 0 and every row of this window is constant. A flat window gives 0 for every mask.\n`,
  );
  const e5 = LAWS_VECTORS.E5;
  const l5 = LAWS_VECTORS.L5;
  example(
    "laws",
    `The E5L5 mask is the outer product of E5 down the columns and L5 along the rows:\n\n` +
      block(`E5^{\\mathsf T} L5 = ${matrix(e5.map((a) => l5.map((b) => a * b)))}`) +
      `\nIts rows weight a smoothed difference from top to bottom, so it responds to horizontal edges and texture. Its weights add up to 0, so flat areas give 0. The filter takes the absolute response and averages it over the energy window.\n`,
  );
}
