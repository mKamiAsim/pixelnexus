# Wavelet transforms

The [Fourier transform](fourier-transform.md) tells how much of each frequency an image holds, but not where. A wavelet transform tells both: it splits the image into coarse and fine parts at several scales, and each coefficient belongs to one place and one scale.

## One level in 2D

A level of the discrete wavelet transform runs a low-pass filter \(h\) and a high-pass filter \(g\) along the rows and along the columns, and keeps every second value. That gives four bands of half the size:

| Band | Rows | Columns | Holds |
|---|---|---|---|
| LL | low | low | a smaller, smoother copy of the image |
| LH | low | high | horizontal edges |
| HL | high | low | vertical edges |
| HH | high | high | diagonal detail |

The next level repeats the split on the LL band. After \(J\) levels there is one coarse band and \(3J\) detail bands. The inverse transform puts them back together exactly.

The filter pair \(h, g\) comes from the chosen wavelet, such as Haar, Daubechies or Symlet. PixelNexus takes the taps and the transforms from PyWavelets (`wavedec2`, `waverec2`, `swt2`, `iswt2`).

## Decimated and stationary

- The **decimated** transform keeps every second value, so it has as many coefficients as pixels. It is fast, but a small shift of the image can change the coefficients a lot.
- The **stationary** transform keeps every value. It has more coefficients, but shifts of the image only shift them. Denoising with it avoids blocky artifacts.

## Denoising by shrinking

Noise spreads over all detail coefficients as small values, while edges make a few large ones. Shrinking small coefficients toward 0 therefore removes noise and keeps edges. PixelNexus estimates the noise from the finest diagonal band, with the median of absolute values divided by about 0.6745, the 75th percentile of the standard normal distribution. The thresholds (VisuShrink, BayesShrink and SureShrink), the soft and hard rules and the Wiener gains are its own code, so the Inspector can show each step.

## Where you see it

- [Wavelet thresholding](../filters/multiscale/wavelet-threshold.md)
- [Stationary wavelet denoising](../filters/multiscale/swt-denoise.md)
- [Wavelet Wiener filter](../filters/multiscale/wavelet-wiener.md)
- The [Laplacian pyramid](../filters/multiscale/laplacian-pyramid.md), a related multiscale split without wavelets.
