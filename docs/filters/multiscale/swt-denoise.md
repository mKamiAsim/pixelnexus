# Stationary wavelet filtering

--8<-- "filters/swt-denoise-facts.md"

## Overview

Stationary wavelet filtering is wavelet thresholding without the subsampling. The usual wavelet transform keeps only every second coefficient at each level, so its result depends on where the image starts. Move the image by one pixel and the blotches near edges move in a different way. The stationary transform keeps every coefficient, so no position is favored, and the blotches average out. The filter offers a second method, cycle spinning, which thresholds a few shifted copies and averages them. The filter runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Four panels: bright disks on a dark ground with grainy noise, then three results with the Haar wavelet. The decimated result has blocky, square-cut disk edges. The cycle spinning result has smoother edges. The stationary result has the smoothest round edges.](../../assets/figures/swt-denoise-light.svg#only-light){ width="480" }
  ![Four panels: bright disks on a dark ground with grainy noise, then three results with the Haar wavelet. The decimated result has blocky, square-cut disk edges. The cycle spinning result has smoother edges. The stationary result has the smoothest round edges.](../../assets/figures/swt-denoise-dark.svg#only-dark){ width="480" }
  <figcaption>Disks with Gaussian noise of sigma 20, filtered with the Haar wavelet by the decimated transform, by cycle spinning with 2 shifts, and by the stationary transform.</figcaption>
</figure>

## How it works

1. Add a few rows and columns, so that each side is a multiple of 2^J.
2. Split each channel with the stationary transform. Every subband keeps one coefficient per pixel.
3. Measure the noise and choose the thresholds, as in wavelet thresholding.
4. Shrink the detail coefficients and rebuild the channel.
5. Remove the added rows and columns.

## Mathematical foundation

--8<-- "filters/swt-denoise-formula.md"

The decimated transform is an orthogonal basis, so it has exactly as many coefficients as pixels. That economy has a price. A shift of the image by one pixel changes which samples each level keeps, so the coefficients change in more than position. Nason and Silverman described the stationary transform, which computes the transform for all shifts at once. It has 3 J + 1 coefficients per pixel instead of one. Coifman and Donoho traced some artifacts of wavelet denoising near edges to this missing shift invariance. Their answer, which they called cycle spinning, is to denoise every shifted copy and average the results. With a fixed threshold, the stationary transform does exactly this for all 2^J x 2^J shifts at once. The tests check the two against each other.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. For the stationary transform, they are the analysis, the filter taps from PyWavelets, the noise estimate, the threshold rule, the shrink rule and the synthesis. For cycle spinning, the shifts and the average come first and last. The filter taps are those of [wavelet thresholding](wavelet-threshold.md#kernel-or-operator).

## Algorithm

--8<-- "filters/swt-denoise-steps.md"

## Parameters

--8<-- "filters/swt-denoise-params.md"

## Implementation

`swt_denoise` in `engine/src/pixelnexus_engine/filters/wavelets.py` runs `stationary_plane` or `cycle_spin_plane` on each channel the scope names. `stationary_plane` pads the plane with NumPy in the border mode and calls `pywt.swt2` and `pywt.iswt2`. In between, it uses the noise estimate, threshold rules and shrink rules of wavelet thresholding. `cycle_spin_plane` shifts the plane with `np.roll`, runs `wavelet_threshold_plane`, shifts the result back and averages. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/swt-denoise.md"

## Complexity

--8<-- "filters/swt-denoise-complexity.md"

## Artifacts and limitations

--8<-- "filters/swt-denoise-limits.md"

## Tests

The main reference is the definition of Coifman and Donoho, written out in the test with PyWavelets. Each of the 8 x 8 circular shifts is thresholded with the periodic decimated transform, shifted back and averaged. The stationary transform matches it to within 10^-9 for three wavelets and both shrink rules. Cycle spinning matches `cycle_spin` of scikit-image for 1, 2 and 3 shifts. More tests check that the stationary result moves with the image for every threshold rule, while the decimated one does not. They also check VisuShrink against a threshold computed by hand, and that odd sizes come back whole for every border mode.

--8<-- "filters/swt-denoise-tests.md"

## References

--8<-- "filters/swt-denoise-references.md"
