# Sparse regularization

--8<-- "filters/sparse-fista-facts.md"

## Overview

Sparse regularization undoes a known blur. It looks for the sharp image whose blurred copy matches the photo and whose wavelet details are sparse: a few large values and many zeros. Noise spreads over many small wavelet details, so the penalty removes it while the deblurring sharpens. The filter minimizes this energy with FISTA, the fast iterative shrinkage algorithm of Beck and Teboulle. It runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Four panels: blurred disks with fine grain; the data term alone, with sharp disks drowned in strong blotchy noise; sparse regularization with sym8, with clean disks and faint ripples at their edges; and Haar with lambda 4, with blocky disks.](../../assets/figures/sparse-fista-light.svg#only-light){ width="480" }
  ![Four panels: blurred disks with fine grain; the data term alone, with sharp disks drowned in strong blotchy noise; sparse regularization with sym8, with clean disks and faint ripples at their edges; and Haar with lambda 4, with blocky disks.](../../assets/figures/sparse-fista-dark.svg#only-dark){ width="480" }
  <figcaption>Disks blurred with a Gaussian of sigma 2 and Gaussian noise of sigma 5. Then the data term alone after 100 steps, sparse regularization with the defaults, and the Haar wavelet with lambda 4.</figcaption>
</figure>

## How it works

1. Extend each channel with the border mode to a size the wavelet transform can halve J times.
2. Start with the blurred photo as the estimate.
3. Take a gradient step on the data term: blur the estimate, compare with the photo, and spread the difference back.
4. Transform with the wavelet, shrink the details by lambda and transform back.
5. Push the next step along the direction the estimate is moving, and repeat.
6. Crop the estimate to the image.

## Mathematical foundation

--8<-- "filters/sparse-fista-formula.md"

The penalty is the L1 norm of the wavelet details, the sum of their absolute values. It is the convex penalty closest to counting the details that are not zero, so it favors sparse answers. The approximation band, the coarse average, is left free. The minimum has no closed form. Daubechies, Defrise and De Mol showed that a gradient step on the data term followed by soft thresholding of the details converges to it. That is ISTA. Its error falls like 1 / k after k steps. Beck and Teboulle added a momentum step in the style of Nesterov, which makes the error fall like 1 / k^2. The wavelet transform is orthogonal here, with the periodization mode of PyWavelets on a grid whose sides are multiples of 2^J. So thresholding in the wavelet domain is the exact proximal step of the penalty.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the PSF, the energy with the value of lambda and the wavelet, the gradient step, the shrink step and the momentum step.

## Algorithm

--8<-- "filters/sparse-fista-steps.md"

## Parameters

--8<-- "filters/sparse-fista-params.md"

## Implementation

`sparse_fista` in `engine/src/pixelnexus_engine/filters/restoration.py` runs `sparse_fista_plane` on each channel the scope names. `fista` holds the iteration and `wavelet_prox` the shrink step, with `pywt.wavedec2` and `pywt.waverec2`. The PSF comes from `engine/src/pixelnexus_engine/psf.py`, and the shrink rule from wavelet thresholding. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/sparse-fista.md"

## Complexity

--8<-- "filters/sparse-fista-complexity.md"

## Artifacts and limitations

--8<-- "filters/sparse-fista-limits.md"

## Tests

The wavelet transform must keep the energy of the image and give it back with a threshold of 0. After 600 steps, FISTA must reach the energy that plain iterative shrinkage, written in the test with `pywt.threshold`, reaches after 6000 steps, to within 0.1 percent. One FISTA step must equal one ISTA step. A blurred noisy image must gain at least 1.5 dB. The engine API tests run jobs and check the stages of the representation.

--8<-- "filters/sparse-fista-tests.md"

## References

--8<-- "filters/sparse-fista-references.md"
