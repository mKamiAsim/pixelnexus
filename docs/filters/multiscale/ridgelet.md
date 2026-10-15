# Ridgelet filtering

--8<-- "filters/ridgelet-facts.md"

## Overview

Ridgelet filtering removes noise from images made of straight lines and edges. A ridgelet is a wave that is constant along lines in one direction, so a long straight line matches a few ridgelets very well. The filter gets the ridgelet coefficients from the Radon transform. Each straight line becomes a single point in the sinogram, and a 1-D wavelet transform along each projection describes those points compactly. The small coefficients are set to zero, and the image is rebuilt by filtered back projection. The sampled Radon transform and its back projection are not exact inverses, so this filter is an approximation. It runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Four panels: three thin bright lines crossing on a dark ground with strong grainy noise; the Radon round trip alone, with somewhat less grain; ridgelet filtering, with clean lines and faint streaks along their directions; and wavelet thresholding, with clean lines and a little blotchy grain.](../../assets/figures/ridgelet-light.svg#only-light){ width="480" }
  ![Four panels: three thin bright lines crossing on a dark ground with strong grainy noise; the Radon round trip alone, with somewhat less grain; ridgelet filtering, with clean lines and faint streaks along their directions; and wavelet thresholding, with clean lines and a little blotchy grain.](../../assets/figures/ridgelet-dark.svg#only-dark){ width="480" }
  <figcaption>Three lines with Gaussian noise of sigma 20, the Radon round trip alone, ridgelet filtering with the defaults, and wavelet thresholding.</figcaption>
</figure>

## How it works

1. Compute the sinogram of each channel.
2. Apply a 1-D wavelet transform along each projection.
3. Estimate the noise level of each projection from its finest details.
4. Set the detail coefficients below k times that level to zero.
5. Invert the 1-D transforms and rebuild the channel by filtered back projection.

## Mathematical foundation

--8<-- "filters/ridgelet-formula.md"

Wavelets are good at points but poor at lines. A straight edge crosses many wavelet positions, and each needs its own large coefficient. Candes and Donoho introduced ridgelets for this case. A ridgelet varies like a wavelet across a direction and is constant along it. They showed that ridgelet analysis is wavelet analysis in the Radon domain: the Radon transform turns a line into a point, and a 1-D wavelet transform handles points well. Curved edges are not lines, so ridgelets alone do not help there. That led Candes and Donoho to curvelets, which apply ridgelets to small blocks of the image, as in the work of Starck, Candes and Donoho.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the Radon transform, the 1-D wavelet transform, the threshold, the shrink rule and the rebuild by filtered back projection. The Inspector marks them as an approximation.

## Algorithm

--8<-- "filters/ridgelet-steps.md"

## Parameters

--8<-- "filters/ridgelet-params.md"

## Implementation

`ridgelet` in `engine/src/pixelnexus_engine/filters/radon.py` runs `ridgelet_plane` on each channel the scope names. It uses the `sinogram` and `back_project` functions of the Radon filter, and `pywt.wavedec` and `pywt.waverec` along the detector axis for all projections at once. `projection_noise` estimates the noise of each projection. The shrink rules come from wavelet thresholding. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/ridgelet.md"

## Complexity

--8<-- "filters/ridgelet-complexity.md"

## Artifacts and limitations

--8<-- "filters/ridgelet-limits.md"

## Tests

With a threshold factor of 0, the result must equal the Radon round trip, the filtered back projection of the sinogram, to within 10^-9. With the default factor, the filter is checked against an independent pipeline written in the test: `radon` of scikit-image, a 1-D PyWavelets transform and `pywt.threshold` for each projection, and `iradon`. The engine API tests run a job and check the stages of the representation.

--8<-- "filters/ridgelet-tests.md"

## References

--8<-- "filters/ridgelet-references.md"
