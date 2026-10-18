// Figure and worked example for steerable filters.
// gen-filter-docs.mjs calls steerableDocs with its helpers. Every number comes from the filter code.

export function steerableDocs(h) {
  const { run, pic, figure, example, mdTable, synthetic, planeAt, fix } = h;
  const star = synthetic.siemensStar(160, 160);
  const steer = (params) =>
    pic(
      run(star, "steerable", {
        sigma: 2,
        channelScope: "luminance",
        outputMapping: "normalize",
        ...params,
      }),
    );
  figure("steerable", {
    message:
      "Steerable derivatives of a Gaussian on a Siemens star. The first derivative at 0 and 45 degrees responds to spokes that cross those directions. The strongest second derivative responds to every spoke edge at once.",
    panels: [
      { title: "Siemens star", image: pic(star) },
      { title: "1st, 0 degrees", image: steer({ order: "1", angle: 0 }) },
      { title: "1st, 45 degrees", image: steer({ order: "1", angle: 45 }) },
      { title: "2nd, strongest", image: steer({ order: "2", output: "strongest" }) },
    ],
  });

  const rows = Array.from({ length: 9 }, (_, y) =>
    Array.from({ length: 9 }, (_, x) => 10 * x + 4 * y),
  );
  const at = (params) => planeAt("steerable", rows, { sigma: 1, order: "1", ...params }, 4, 4);
  const d0 = at({ angle: 0 });
  const d90 = at({ angle: 90 });
  const d30 = at({ angle: 30 });
  const c = Math.cos(Math.PI / 6);
  const s = Math.sin(Math.PI / 6);
  example(
    "steerable",
    mdTable(
      ["Output at the center", "Value"],
      [
        ["Steered to 0 degrees, equal to G_x", fix(d0, 4)],
        ["Steered to 90 degrees, equal to -G_y", fix(d90, 4)],
        ["cos 30 x (0 degrees) + sin 30 x (90 degrees)", fix(c * d0 + s * d90, 4)],
        ["Steered to 30 degrees, from the filter", fix(d30, 4)],
        ["Strongest", fix(at({ output: "strongest" }), 4)],
        ["Angle of the strongest", fix(at({ output: "angle" }), 2)],
      ],
    ) +
      `\nA 9 x 9 ramp with the value 10 x + 4 y, sigma 1 and the first derivative. The brightness rises by 10 per pixel along x and by 4 per pixel down, so G_x is close to 10 and G_y close to 4. They come out slightly low, because the Gaussian is cut at 4 sigma. The direction at 90 degrees points up, so that output is -G_y. Mixing the outputs at 0 and 90 degrees with cos 30 and sin 30 gives the output at 30 degrees, which is the steering rule. The strongest response is the length of (G_x, G_y), and its angle, atan2(-G_y, G_x), points toward the brightest side, down and to the right.\n`,
  );
}
