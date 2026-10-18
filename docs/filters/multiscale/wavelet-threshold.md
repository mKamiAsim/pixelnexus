# Wavelet thresholding

--8<-- "filters/wavelet-threshold-facts.md"

## Overview

Wavelet thresholding removes Gaussian noise. It describes the image with wavelets, small waves at several sizes and in three directions. Noise spreads over many small wavelet coefficients, while edges and shapes make a few large ones. So the filter sets the small coefficients to zero, keeps the large ones, and rebuilds the image. One entry covers the classic variants: the Haar, Daubechies, Symlet and Coiflet wavelets, hard and soft thresholding, and the VisuShrink, BayesShrink and SureShrink rules for the threshold. The filter runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Four panels: bright disks on a dark ground with strong grainy noise, then the three results. The VisuShrink result is clean but soft, with blurred disk edges. The BayesShrink and SureShrink results are clean, with sharp edges.](../../assets/figures/wavelet-threshold-light.svg#only-light){ width="480" }
  ![Four panels: bright disks on a dark ground with strong grainy noise, then the three results. The VisuShrink result is clean but soft, with blurred disk edges. The BayesShrink and SureShrink results are clean, with sharp edges.](../../assets/figures/wavelet-threshold-dark.svg#only-dark){ width="480" }
  <figcaption>Disks with Gaussian noise of sigma 20, and the result of three threshold rules with the default settings.</figcaption>
</figure>

## How it works

1. Split each channel into a small low-pass copy and, at each of J levels, three detail images: horizontal, vertical and diagonal.
2. Measure the noise from the finest diagonal details, unless you set it.
3. Pick a threshold for each detail image with the chosen rule.
4. Set the small detail coefficients to zero. With soft thresholding, also move the others toward zero by the threshold.
5. Rebuild the channel from the low-pass copy and the changed details.

## Mathematical foundation

--8<-- "filters/wavelet-threshold-formula.md"

Mallat showed how a wavelet transform splits a signal level by level with a pair of filters, a low-pass and a high-pass, each followed by keeping every second sample. In 2-D, rows and columns are filtered in turn, so each level gives three detail subbands. Daubechies built orthogonal wavelets with short filters. For an orthogonal transform, the energy of the image equals the energy of its coefficients, and noise keeps its strength in every subband.

Donoho and Johnstone proved that the universal threshold sigma sqrt(2 ln N) removes pure noise with a probability that tends to 1 as N grows. That makes VisuShrink smooth but often too smooth for images. Donoho showed that soft thresholding at this level gives a result that is, with high probability, at least as smooth as the true signal. SureShrink chooses the threshold of each subband by Stein's unbiased risk estimate, an estimate of the mean squared error that needs no clean image. BayesShrink models the coefficients of each subband with a generalized Gaussian distribution. Chang, Yu and Vetterli found that sigma^2 / sigma_x is close to the threshold that minimizes the Bayesian risk of soft thresholding for that model.

## Kernel or operator

The Inspector asks the engine for the stages of the filter with the current settings. They are the analysis with the filter taps of the chosen wavelet, the noise estimate, the threshold rule, the shrink rule and the synthesis. The engine builds them with the code that runs the filter.

--8<-- "kernels/wavelet-threshold.md"

## Algorithm

--8<-- "filters/wavelet-threshold-steps.md"

## Parameters

--8<-- "filters/wavelet-threshold-params.md"

## Implementation

`wavelet_threshold` in `engine/src/pixelnexus_engine/filters/wavelets.py` runs `wavelet_threshold_plane` on each channel the scope names, through `filter_by_scope` in `engine/src/pixelnexus_engine/planes.py`, which follows the same color rules as the browser filters. PyWavelets computes the transform with `wavedec2` and `waverec2`. The noise estimate (`estimate_sigma`), the thresholds (`universal_threshold`, `bayes_threshold` and `sure_threshold`) and the shrink rules (`shrink`) are PixelNexus code. The levels are capped at the deepest level that `pywt.dwtn_max_level` allows for the image size. The engine checks every value against the catalog before it runs the job. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/wavelet-threshold.md"

## Complexity

--8<-- "filters/wavelet-threshold-complexity.md"

## Artifacts and limitations

--8<-- "filters/wavelet-threshold-limits.md"

## Tests

The reference for VisuShrink and BayesShrink is `denoise_wavelet` of scikit-image, which uses the same thresholds. The tests compare it with the filter for 3 wavelets, 1 and 3 levels, and both shrink rules. They use the estimated noise and a given one. They match to within 10^-9. SureShrink has no reference in scikit-image, so a brute-force search over a fine grid of thresholds checks that the SURE threshold is the minimum. More tests check the noise estimate against `estimate_sigma` of scikit-image and the shrink rules against `pywt.threshold`. They check that a zero threshold gives the image back for every border mode, and they check the level cap, the color scopes and alpha. One test runs a full job through the engine API, with its parameter checks and its representation.

--8<-- "filters/wavelet-threshold-tests.md"

## References

--8<-- "filters/wavelet-threshold-references.md"
