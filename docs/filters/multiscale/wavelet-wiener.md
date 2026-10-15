# Wavelet Wiener filtering

--8<-- "filters/wavelet-wiener-facts.md"

## Overview

Wavelet Wiener filtering removes Gaussian noise with a smooth gain instead of a cut. Like wavelet thresholding, it splits the image into wavelet subbands. Then it looks at the neighbors of each detail coefficient. If they hold no more energy than noise would give, the coefficient is turned down to near zero. If they hold much more, as along an edge or in a texture, it is kept almost whole. The filter runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Four panels: bright disks on a dark ground with grainy noise, then three results. BayesShrink is clean with faint blotches. Wiener with the smallest estimate is clean, with sharp disk edges. Wiener with a 9 by 9 window leaves a ring of grain along each disk edge.](../../assets/figures/wavelet-wiener-light.svg#only-light){ width="480" }
  ![Four panels: bright disks on a dark ground with grainy noise, then three results. BayesShrink is clean with faint blotches. Wiener with the smallest estimate is clean, with sharp disk edges. Wiener with a 9 by 9 window leaves a ring of grain along each disk edge.](../../assets/figures/wavelet-wiener-dark.svg#only-dark){ width="480" }
  <figcaption>Disks with Gaussian noise of sigma 20, filtered by wavelet thresholding with BayesShrink, and by wavelet Wiener filtering with the smallest estimate and with a 9 x 9 window.</figcaption>
</figure>

## How it works

1. Split each channel into a small low-pass copy and J levels of horizontal, vertical and diagonal details.
2. Measure the noise from the finest diagonal details, unless you set it.
3. For each detail coefficient, take the mean of the squared coefficients around it and subtract the noise variance. This estimates how much signal is there.
4. Multiply the coefficient by the share of signal in signal plus noise.
5. Rebuild the channel.

## Mathematical foundation

--8<-- "filters/wavelet-wiener-formula.md"

The Wiener filter is the linear filter with the least mean squared error when the signal and the noise are Gaussian with known variances. A global Wiener filter uses one signal variance for the whole image, which smooths edges as much as flat areas. Wavelet coefficients of photos are not like that. They are small in most places and large along edges and in textures. Mihcak, Kozintsev, Ramchandran and Moulin gave each coefficient its own variance and estimated it from a small window around it. That needs no training and costs little, yet it adapts the gain to each place in each subband. A small window follows edges closely but gives a noisy estimate. A large window gives a steady estimate but carries edge energy into the flat areas next to the edge, so noise survives there. Keeping the smallest estimate over several windows reduces the second problem.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the analysis, the filter taps, the noise estimate, the local variance with its windows, the Wiener gain and the synthesis. The filter taps are those of [wavelet thresholding](wavelet-threshold.md#kernel-or-operator).

## Algorithm

--8<-- "filters/wavelet-wiener-steps.md"

## Parameters

--8<-- "filters/wavelet-wiener-params.md"

## Implementation

`wavelet_wiener` in `engine/src/pixelnexus_engine/filters/wavelets.py` runs `wavelet_wiener_plane` on each channel the scope names. It uses `pywt.wavedec2` and `pywt.waverec2`, and the noise estimate of wavelet thresholding. `local_signal_variance` computes the window means of the squared coefficients with `scipy.ndimage.uniform_filter`. It mirrors the subband at its edges. `wiener_gain` turns the variance into the gain. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/wavelet-wiener.md"

## Complexity

--8<-- "filters/wavelet-wiener-complexity.md"

## Artifacts and limitations

--8<-- "filters/wavelet-wiener-limits.md"

## Tests

The local variance is checked against explicit windows over a mirrored copy of the subband, built with NumPy. The tests cover windows of 3, 5 and 9, and the smallest of four sizes. The whole filter is checked against an independent pipeline: PyWavelets, the explicit windows and the Wiener gain written out in the test. They match to within 10^-9. More tests check that the gains stay from 0 to 1, that a flat image stays flat, and a full job through the engine API with its representation.

--8<-- "filters/wavelet-wiener-tests.md"

## References

--8<-- "filters/wavelet-wiener-references.md"
