// Figures and worked examples for Richardson-Lucy, Landweber and projected Landweber.
// gen-filter-docs.mjs calls iterativeDocs with its helpers. Every number comes from the code.

export function iterativeDocs(h) {
  const { run, pic, figure, example, mdTable, fix, synthetic, qualityMetrics } = h;
  const disks = synthetic.disks(160, 160);
  const blur = { psf: "gaussian", sigma: 2, channelScope: "rgb" };
  const blurred = run(disks, "degrade-blur", blur);
  const noisy = run(blurred, "noise-gaussian", { sigma: 2, seed: 7, monochrome: true });
  const specs = {
    "richardson-lucy": { name: "Richardson-Lucy", params: blur, counts: [5, 50] },
    landweber: { name: "Landweber", params: { ...blur, tau: 1.5 }, counts: [5, 50] },
    "nnls-deconv": { name: "Projected Landweber", params: { ...blur, tau: 1.5 }, counts: [5, 50] },
  };
  const psnr = (image) => {
    const v = qualityMetrics(image, disks).psnr;
    return Number.isFinite(v) ? fix(v, 2) : "infinite";
  };
  for (const [id, spec] of Object.entries(specs)) {
    const [few, many] = spec.counts;
    figure(id, {
      message: `${spec.name} on a Gaussian blur with sigma 2 and noise of sigma 2, after ${few} and ${many} iterations.`,
      panels: [
        { title: "Blur and noise", image: pic(noisy) },
        {
          title: `${few} iterations`,
          image: pic(run(noisy, id, { ...spec.params, iterations: few })),
        },
        {
          title: `${many} iterations`,
          image: pic(run(noisy, id, { ...spec.params, iterations: many })),
        },
      ],
    });
    const counts = [1, 5, 10, 20, 50, 100];
    example(
      id,
      mdTable(
        ["Iterations", ...counts.map(String)],
        [
          [
            "PSNR (dB)",
            ...counts.map((k) => psnr(run(noisy, id, { ...spec.params, iterations: k }))),
          ],
        ],
      ) +
        `\nThe PSNR against the clean disks for the image of the figure, ${psnr(noisy)} dB before the filter${id === "richardson-lucy" ? "" : ", with step size 1.5"}. The value rises while the iterations restore detail. When it falls again, the iterations have started to raise the noise, so stopping early acts as regularization.\n`,
    );
  }
}
