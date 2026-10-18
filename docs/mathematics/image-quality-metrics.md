# Image quality metrics

A quality metric compares an image with a reference and gives one number. PixelNexus has four, on the red, green and blue channels, leaving out alpha. They are computed in `web/src/core/metrics/quality.ts`, and tests compare them with `skimage.metrics`.

## MSE and MAE

For \(n\) pixels and 3 channels, with image \(I\) and reference \(R\):

\[
\mathrm{MSE} = \frac{1}{3n} \sum_{p, c} \bigl(I_c(p) - R_c(p)\bigr)^2
\qquad
\mathrm{MAE} = \frac{1}{3n} \sum_{p, c} \bigl|I_c(p) - R_c(p)\bigr|
\]

Both are 0 for equal images. MSE punishes large errors more than MAE.

## PSNR

\[
\mathrm{PSNR} = 10 \log_{10} \frac{255^2}{\mathrm{MSE}} \ \text{dB}
\]

Higher is better. It is infinite for equal images. PSNR is simple to compute and compare. But it does not follow what people see. A small shift of the whole image lowers it a lot, while some visible artifacts lower it little.

## SSIM

The structural similarity index (Wang, Bovik, Sheikh and Simoncelli, 2004) compares local means \(\mu\), variances \(\sigma^2\) and covariance \(\sigma_{IR}\) in a Gaussian window:

\[
\mathrm{SSIM} = \frac{(2 \mu_I \mu_R + C_1)(2 \sigma_{IR} + C_2)}{(\mu_I^2 + \mu_R^2 + C_1)(\sigma_I^2 + \sigma_R^2 + C_2)}
\]

with \(C_1 = (0.01 \cdot 255)^2\) and \(C_2 = (0.03 \cdot 255)^2\). PixelNexus follows `skimage.metrics.structural_similarity` with Gaussian weights. The window sigma is 1.5, and the border mode is reflect. A 5-pixel frame where the window does not fit is left out. The map is averaged, then the three channels. SSIM is 1 for equal images, and follows visible structure better than PSNR.

## Inside a selection

With a selection, only pixels that are at least half selected count. For SSIM the map is averaged over those pixels inside the frame.

## Where you see it

The [Metrics panel](../user-guide/metrics.md) and the [metrics page](../filters/utility/metrics.md). The Learn panel's Noise lab shows PSNR and SSIM for a damaged and a repaired patch.
