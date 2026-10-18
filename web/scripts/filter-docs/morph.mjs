// Figures and worked examples for the grayscale morphology filters.
// gen-filter-docs.mjs calls morphDocs with its helpers. Every number comes from the filter code.

const OPS = {
  erosion: {
    name: "Erosion",
    message:
      "Erosion with disk 2 on disks with salt-and-pepper noise. Bright disks shrink, the white specks vanish, and the black specks grow.",
    rule: "Each output is the smallest of the pixel and its left and right neighbors.",
  },
  dilation: {
    name: "Dilation",
    message:
      "Dilation with disk 2 on disks with salt-and-pepper noise. Bright disks grow, the black specks vanish, and the white specks grow.",
    rule: "Each output is the largest of the pixel and its left and right neighbors.",
  },
  opening: {
    name: "Opening",
    message:
      "Opening with disk 2 on disks with salt-and-pepper noise. The white specks vanish and the disks keep their size. The black specks stay.",
    rule: "The opening erodes and then dilates. The bright peak of width 1 at x = 2 is narrower than the element, so it vanishes. The plateaus of width 3 keep their width.",
  },
  closing: {
    name: "Closing",
    message:
      "Closing with disk 2 on disks with salt-and-pepper noise. The black specks vanish and the disks keep their size. The white specks stay.",
    rule: "The closing dilates and then erodes. The dark dip of width 1 at x = 9 is narrower than the element, so it fills in. The dark gap of width 3 next to the peak stays.",
  },
  "morph-gradient": {
    name: "Morphological gradient",
    message:
      "The morphological gradient with disk 1 on the same image. Edges are bright and two pixels thick, and every speck becomes a small ring.",
    rule: "Each output is the largest minus the smallest of the pixel and its two neighbors, so it is large where the row changes.",
  },
  "internal-gradient": {
    name: "Internal gradient",
    message: "The internal gradient with disk 1. The edges lie directly inside the bright disks.",
    rule: "Each output is the pixel minus the smallest of the pixel and its two neighbors, so it marks the bright side of each change.",
  },
  "external-gradient": {
    name: "External gradient",
    message: "The external gradient with disk 1. The edges lie directly outside the bright disks.",
    rule: "Each output is the largest of the pixel and its two neighbors minus the pixel, so it marks the dark side of each change.",
  },
  tophat: {
    name: "Top-hat",
    message:
      "The top-hat with disk 3. Only the bright details smaller than the element remain: the white specks and the smallest dots.",
    rule: "The top-hat is the row minus its opening. Only the narrow bright peak at x = 2 is left.",
  },
  blackhat: {
    name: "Black-hat",
    message:
      "The black-hat with disk 3. Only the dark details smaller than the element remain, now bright: the black specks.",
    rule: "The black-hat is the closing minus the row. Only the narrow dark dip at x = 9 is left, as a bright value.",
  },
};

export function morphDocs(h) {
  const { run, pic, figure, example, mdTable, synthetic, planeAt } = h;
  const noisy = run(synthetic.disks(120, 120), "noise-salt-pepper", {
    amount: 0.04,
    seed: 6,
    monochrome: true,
  });
  for (const [id, op] of Object.entries(OPS)) {
    const element =
      id === "tophat" || id === "blackhat"
        ? "disk 3"
        : id.includes("gradient")
          ? "disk 1"
          : "disk 2";
    figure(id, {
      message: op.message,
      panels: [
        { title: "Noisy disks", image: pic(noisy) },
        {
          title: `${op.name}, ${element}`,
          image: pic(run(noisy, id, { element, channelScope: "luminance" })),
        },
      ],
    });
    // One row repeated, with a horizontal element of 3 pixels, so only left and right count.
    const row = [20, 20, 200, 20, 20, 20, 180, 180, 180, 60, 180, 180, 180, 20, 20];
    const rows = [row, row, row];
    const xs = row.map((_, x) => x);
    const out = xs.map((x) => planeAt(id, rows, { element: "line 3 0" }, x, 1));
    example(
      id,
      mdTable(
        ["x", ...xs.map(String)],
        [
          ["Input", ...row.map(String)],
          [op.name, ...out.map((v) => String(Math.round(v)))],
        ],
      ) +
        `\nOne row of an image whose rows are all the same, with the element line 3 0: the pixel and its left and right neighbors. ${op.rule} At the ends, the reflect 101 border mirrors the row.\n`,
    );
  }
}
