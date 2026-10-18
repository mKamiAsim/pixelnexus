# Noise models

Real images carry noise from the sensor, the light and compression. PixelNexus can add the common kinds to a clean image, so you can see what each one does and test denoisers on it. Each model has its own page with the exact formula and a worked example.

| Model | How it acts | Formula | Page |
|---|---|---|---|
| Gaussian | Adds a normal value to every pixel and channel | \(I + \sigma n,\ n \sim \mathcal{N}(0, 1)\) | [Add Gaussian noise](../filters/utility/noise-gaussian.md) |
| Salt and pepper | Sets a share of pixels to white or black | probability \(p\), white share \(s\) | [Add salt-and-pepper noise](../filters/utility/noise-salt-pepper.md) |
| Speckle | Multiplies by a random factor with mean 1 | \(I (1 + \sigma n)\) | [Add speckle noise](../filters/utility/noise-speckle.md) |
| Poisson (shot) | Counts photons, more noise where brighter | \(k \sim \mathrm{Poisson}(I P / 255)\), \(255 k / P\) | [Add Poisson noise](../filters/utility/noise-poisson.md) |
| Periodic | Adds a sine wave | \(I + A \sin(2\pi(f_x x + f_y y) + \varphi)\) | [Add periodic noise](../filters/utility/noise-periodic.md) |

## Additive and signal-dependent

- **Additive** noise, such as Gaussian noise, does not depend on the value. Its standard deviation is the same in dark and bright areas.
- **Signal-dependent** noise grows with the value. For Poisson noise the variance equals the mean count, so the standard deviation in levels is \(\sqrt{255 I / P}\). For speckle it is \(\sigma I\).

## Which denoiser fits

- Gaussian noise: Gaussian blur, nonlocal means, BM3D-lite, wavelet thresholding, DnCNN.
- Salt and pepper: the median filter, which ignores extreme values.
- Periodic noise: a notch reject filter, since the wave is a pair of points in the [spectrum](fourier-transform.md).
- Poisson noise: a variance-stabilizing transform before a Gaussian denoiser.

## Reproducible noise

The random numbers depend only on the seed, the position and the channel. So the same seed always gives the same noise, and a region gives the same noise as the whole image. Results outside 0 to 255 are clipped.

To measure a repair, add noise, run a filter, and compare with the original in the [Metrics panel](../user-guide/metrics.md). The measures are explained in [Image quality metrics](image-quality-metrics.md).
