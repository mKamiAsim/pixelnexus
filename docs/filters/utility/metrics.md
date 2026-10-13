# Quality metrics

--8<-- "filters/metrics-facts.md"

## Overview

Quality metrics compare the active image with a reference image and report four numbers: PSNR, SSIM, MSE and MAE. Open them with **Filter > Quality metrics**, or in the Metrics panel. The reference is the original of the active image, or another open image of the same size. A common use is to add noise to a clean image, run a denoising filter, and measure how close the result is to the original.

## How it works

1. Choose the reference in the Metrics panel.
2. The panel adds up the pixel differences for MSE and MAE, and computes PSNR from MSE.
3. It computes local means, variances and covariance with a Gaussian window for SSIM.
4. The numbers update when the image or the reference changes.

## Mathematical foundation

--8<-- "filters/metrics-formula.md"

MSE and MAE are averages of the error. PSNR rescales MSE to decibels relative to the largest value, 255, so a higher PSNR means a smaller error. SSIM, from Wang, Bovik, Sheikh and Simoncelli, compares local brightness, contrast and structure. It ranges from -1 to 1, with 1 for equal images, and it agrees better with how people judge quality than MSE does.

## Kernel or operator

SSIM uses a Gaussian window with sigma 1.5, truncated at 3.5 sigma, so it is 11 pixels wide. The other three metrics compare pixel by pixel.

## Algorithm

--8<-- "filters/metrics-steps.md"

## Implementation

`qualityMetrics` in `web/src/core/metrics/quality.ts` computes all four numbers. SSIM follows `skimage.metrics.structural_similarity` with Gaussian weights and the population covariance: the blur uses the reflect mode, and a 5-pixel frame is left out of the mean. The Metrics panel runs it in the main thread and keeps the result for each pair of images, so redrawing the panel costs nothing. The catalog entry names the command `filter.metrics`, which opens the panel.

## Worked example

Take one pixel channel with value 120 in the image and 100 in the reference. Its squared difference is 400 and its absolute difference 20. If every channel of every pixel differs by 20, then MSE = 400, MAE = 20, and PSNR = 10 log10(65025 / 400) = 22.11 dB. An MSE of 4, a difference of 2 everywhere, gives 42.11 dB.

## Complexity

--8<-- "filters/metrics-complexity.md"

## Artifacts and limitations

--8<-- "filters/metrics-limits.md"

## Tests

The fixture script computes the four metrics of a smooth image and a noisy copy with `skimage.metrics`: `mean_squared_error`, `peak_signal_noise_ratio` and `structural_similarity` with Gaussian weights. The test matches MSE, MAE and PSNR to 9 decimals and SSIM within 0.00001. Other tests check equal images and the size checks.

--8<-- "filters/metrics-tests.md"

## References

--8<-- "filters/metrics-references.md"
