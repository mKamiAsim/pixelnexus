// Figures and worked examples for connected-component labeling, region growing and k-means
// color segmentation. gen-filter-docs.mjs calls regionDocs with its helpers. Every number comes
// from the code.

export function regionDocs(h) {
  const { run, pic, figure, example, mdTable, fix, synthetic, planesOf } = h;
  const { componentLabels, kmeansColors } = h;
  const color = (image) => pic(image, true);

  // Labeling: the test disks, with their single-pixel dots.
  {
    const disks = synthetic.disks(160, 160);
    const stats = (connectivity) => {
      const { labels, count } = componentLabels(planesOf(disks), { connectivity });
      const areas = new Array(count + 1).fill(0);
      for (const l of labels) areas[l]++;
      const sizes = areas.slice(1).sort((a, b) => b - a);
      return [count, sizes[0], sizes[sizes.length - 1], sizes.filter((a) => a === 1).length];
    };
    figure("ccl", {
      message: "The test disks and their components, each in its own color.",
      panels: [
        { title: "Disks", image: pic(disks) },
        { title: "Components", image: color(run(disks, "ccl", {})) },
      ],
    });
    example(
      "ccl",
      mdTable(
        ["Neighbors", "Components", "Largest area", "Smallest area", "Single pixels"],
        ["8", "4"].map((c) => [c, ...stats(c).map(String)]),
      ) +
        "\nThe test disks of the figure, 160 by 160 pixels: bright disks of several sizes and single bright dots on a dark background. Areas are in pixels. The disks are solid, so their count does not depend on the neighbors. A difference between the rows would come from shapes that touch only at a corner.\n",
    );
  }

  // Region growing: noisy disks, seeded at the center of the largest disk, at the bottom left.
  {
    const noisy = run(synthetic.disks(160, 160), "noise-gaussian", { sigma: 12, seed: 7 });
    const area = (image) => {
      let n = 0;
      for (let i = 0; i < image.width * image.height; i++) if (image.data[i * 4] > 127) n++;
      return n;
    };
    const seed = { seedX: 25, seedY: 62.5 };
    const tolerances = [20, 40, 80, 120, 160, 200];
    const results = tolerances.map((t) => [
      t,
      run(noisy, "region-growing", { ...seed, tolerance: t }),
    ]);
    figure("region-growing", {
      message:
        "Noisy disks, and the region grown from a seed in the largest disk with tolerances 20, 80 and 200.",
      panels: [
        { title: "Noisy disks", image: pic(noisy) },
        ...[0, 2, 5].map((k) => ({
          title: `Tolerance ${tolerances[k]}`,
          image: pic(results[k][1]),
        })),
      ],
    });
    example(
      "region-growing",
      mdTable(
        ["Tolerance", "Region area (pixels)"],
        results.map(([t, image]) => [String(t), String(area(image))]),
      ) +
        "\nThe test disks with Gaussian noise of sigma 12 (seed 7), 160 by 160 pixels, and the seed at 25 % of the width and 62.5 % of the height, the center of the largest disk. Brightness and 8 neighbors are the defaults. A small tolerance leaves noisy pixels out, so the region has holes. Once the tolerance covers the noise, the region is the disk, about 1590 pixels. The disk is 220 and the background 30, so when the tolerance nears that gap of 190, noisy background pixels start to match, and the region leaks into the background.\n",
    );
  }

  // K-means: the hue sweep with 2, 4, 8 and 16 clusters.
  {
    const sweep = synthetic.hueSweep(180, 60);
    const mse = (image) => {
      let sum = 0;
      for (let i = 0; i < 180 * 60; i++) {
        for (let c = 0; c < 3; c++) sum += (image.data[i * 4 + c] - sweep.data[i * 4 + c]) ** 2;
      }
      return sum / (180 * 60 * 3);
    };
    const ks = [2, 4, 8, 16];
    const rows = ks.map((k) => {
      const { iterations } = kmeansColors(planesOf(sweep), k, 100);
      const image = run(sweep, "kmeans-color", { k, iterations: 100 });
      return [k, iterations, image];
    });
    figure("kmeans-color", {
      message: "The hue sweep, and k-means color segmentation with 4 and 16 clusters.",
      panels: [
        { title: "Hue sweep", image: color(sweep) },
        { title: "k = 4", image: color(rows[1][2]) },
        { title: "k = 16", image: color(rows[3][2]) },
      ],
    });
    example(
      "kmeans-color",
      mdTable(
        ["k", "Iterations until stable", "Mean squared error"],
        rows.map(([k, iterations, image]) => [String(k), String(iterations), fix(mse(image), 1)]),
      ) +
        "\nThe hue sweep of the figure, 180 by 60 pixels. Each pixel is replaced by the mean color of its cluster. The error is the mean squared difference from the sweep over all channels, after rounding to whole levels. More clusters fit the colors more closely.\n",
    );
  }
}
