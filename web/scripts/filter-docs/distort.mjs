// Figures and worked examples for the geometric distortions.
// gen-filter-docs.mjs calls distortDocs with its helpers. Every number comes from the code.

export function distortDocs(h) {
  const { run, pic, figure, example, mdTable, fix, synthetic } = h;
  const { fisheyeSource, polynomialSource, swirlMapping, rippleMapping, waveMapping } = h;

  const board = synthetic.checkerboard(160, 120, 10);
  const show = (id, label, params) =>
    figure(id, {
      message: `A checkerboard, and the ${label} with ${params.text}.`,
      panels: [
        { title: "Checkerboard", image: pic(board) },
        {
          title: label.charAt(0).toUpperCase() + label.slice(1),
          image: pic(run(board, id, params.values)),
        },
      ],
    });
  const rs = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const radialTable = (rows, note) =>
    mdTable(
      ["r", ...rs.map(String)],
      rows.map(([label, f]) => [label, ...rs.map((r) => fix(f(r), 3))]),
    ) + note;

  show("fisheye", "fisheye distortion", {
    text: "a field of view of 150 degrees",
    values: { fov: 150 },
  });
  example(
    "fisheye",
    radialTable(
      [
        ["r_s, 90 degrees", fisheyeSource(90)],
        ["r_s, 150 degrees", fisheyeSource(150)],
      ],
      "\nThe source distance that an output pixel at distance r reads, both as shares of half the diagonal. The center reads from closer in, so it is enlarged, and the corner at r = 1 stays. A wider field enlarges the center more.\n",
    ),
  );

  show("barrel", "barrel distortion", { text: "strength 0.5", values: { strength: 0.5 } });
  example(
    "barrel",
    radialTable(
      [
        ["r_s, k = 0.5, keep corners", polynomialSource(0.5, true)],
        ["r_s, k = 0.5, no fit", polynomialSource(0.5, false)],
      ],
      "\nWith Keep corners on, the center reads from closer in and the corner stays, so the middle is enlarged and lines bow outward. With it off, the edges read from up to 1.5 times as far out, beyond the image, where the border mode fills in.\n",
    ),
  );

  show("pincushion", "pincushion distortion", { text: "strength 0.3", values: { strength: 0.3 } });
  example(
    "pincushion",
    radialTable(
      [["r_s, k = 0.3, keep corners", polynomialSource(-0.3, true)]],
      "\nThe source distance for strength 0.3. It rises faster than r in the middle and slower near the corner, so the edges are stretched and lines bow inward.\n",
    ),
  );

  {
    const map = swirlMapping(160, 120, { strength: 4, radius: 60 });
    const cx = 79.5;
    const cy = 59.5;
    const rhos = [5, 10, 20, 40, 60];
    const turn = (rho) => {
      const [sx, sy] = map(cx + rho, cy);
      return (Math.atan2(sy - cy, sx - cx) * 180) / Math.PI;
    };
    show("swirl", "swirl distortion", {
      text: "strength 4 and radius 60",
      values: { strength: 4, radius: 60 },
    });
    example(
      "swirl",
      mdTable(
        ["Distance from the center", ...rhos.map(String)],
        [["Turn (degrees)", ...rhos.map((r) => fix(turn(r), 2))]],
      ) +
        "\nThe angle by which an output pixel to the right of the center reads its source, with strength 4 and radius 60. At the center the turn is 4 radians, 229 degrees. It halves about every 6 pixels, and at the radius it is almost gone.\n",
    );
  }

  {
    const map = rippleMapping(160, 120, { amplitude: 4, wavelength: 24 });
    const cx = 79.5;
    const rhos = [0, 6, 12, 18, 24, 30];
    show("ripple", "ripple distortion", {
      text: "amplitude 4 and wavelength 24",
      values: { amplitude: 4, wavelength: 24 },
    });
    example(
      "ripple",
      mdTable(
        ["Distance rho", ...rhos.map(String)],
        [["Source distance", ...rhos.map((r) => fix(map(cx + r, 59.5)[0] - cx, 2))]],
      ) +
        "\nThe distance from the center that a pixel at distance rho reads, with amplitude 4 and wavelength 24. It runs 4 pixels ahead a quarter wave out and 4 pixels behind three quarters out, and matches rho at every half wave.\n",
    );
  }

  {
    const map = waveMapping({ amplitude: 6, wavelength: 40, direction: "horizontal" });
    const ys = [0, 10, 20, 30, 40];
    show("wave", "wave distortion", {
      text: "amplitude 6, wavelength 40, rows moving sideways",
      values: { amplitude: 6, wavelength: 40 },
    });
    example(
      "wave",
      mdTable(
        ["Row y", ...ys.map(String)],
        [["Shift of the row", ...ys.map((y) => fix(map(0, y)[0], 2))]],
      ) +
        "\nHow far each row reads to the side, with amplitude 6 and wavelength 40. The shift follows one full sine wave every 40 rows.\n",
    );
  }
}
