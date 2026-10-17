# Maths audit

Phase 10 of `planning/PLAN.md`. This file is not part of the published site.

## Automated check: Inspector kernels

`web/src/core/filters/filters.test.ts`, section "every Inspector kernel is the kernel that runs", checks every browser filter whose Inspector shows kernels, at its default parameters:

- 25 filters with one kernel: the output is the correlation with the kernel shown. Emboss and outline add the offsets 128 and 255, which their kernel notes name.
- Sobel, Prewitt, Scharr, Roberts and Farid-Simoncelli: the gx and gy outputs are the two kernels. Gabor: the real and imaginary outputs.
- Steerable: the steered output at 30 degrees is cos t G_x - sin t G_y.
- Kirsch, Robinson and the line detector: the output is the largest response of the kernels.
- Frei-Chen: the edge output is computed again from the nine kernels shown.
- Laws and the matched vessel filter show a kernel that is only the first step. Their outputs are checked against NumPy references in `tools/fixtures_gradients.py` and `tools/fixtures_oriented.py`.

A last test fails when a filter with kernels belongs to none of these groups, so new filters cannot slip past. Science engine filters show no kernels.

## Review by hand of 20 random filter pages (2026-10-17)

The 20 entries were drawn with `random.seed(20261017)` from the 297 entries marked implemented-tested. For each, the formula, the text of the Mathematical foundation and the claims about the method were read against the code that runs.

| Entry | Engine | Result |
|---|---|---|
| `local-variance` | browser | Pass. Float64 running sums, population variance, negatives set to 0. |
| `binomial` | browser | Pass. The repeated averaging identity is checked in `tools/fixtures_filters.py`. |
| `shi-tomasi` | browser | Pass. Smaller eigenvalue, Sobel on a 0 to 1 scale, the peak rule as written. |
| `glcm` | science | Pass. graycoprops, entropy with the natural log, 210 pairs in a 15 x 15 window. |
| `directional-curvelet` | science | Pass. Radial and angular windows, threshold k sigma RMS of the mask. |
| `thinning` | browser | Pass. Zhang-Suen conditions of the paper. Guo-Hall is compared with skimage. |
| `weighted-average` | browser | Pass. Normalization only for a nonzero sum. |
| `white-patch` | browser | Pass. Percentile on the levels, gain 1 for a percentile of 0. |
| `wavelet-wiener` | science | Pass. Smallest estimate over windows 3 to 9, sigma from the finest diagonal band. |
| `multi-otsu` | science | Pass. A level equal to a threshold goes to the class below. |
| `gaussian-pyramid` | browser | Pass. [1, 4, 6, 4, 1] / 16, sizes rounded up. |
| `switching-median` | browser | Pass. Threshold 0 gives the plain median. |
| `vibrance` | browser | Pass. The gray weights add up to 1, so the gray value is kept. |
| `red` | science | Pass. The test with a symmetric linear denoiser reaches the exact minimum. |
| `cls` | browser | Pass. 60 bisection steps on log10 gamma from -10 to 4. |
| `geodesic` | browser | Pass. |
| `grabcut` | science | Pass. OpenCV uses 5 mixture colors, gamma 50 and cheaper diagonals. |
| `gamma` | browser | Pass. |
| `landweber` | browser | Fixed. The formula said k = 0 to K, one step too many. The code runs K steps, so k = 0 to K - 1. The same fix went into `nnls-deconv` and `richardson-lucy`. |
| `min` | browser | Pass. |
