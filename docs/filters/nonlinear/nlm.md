# Non-local means

--8<-- "filters/nlm-facts.md"

## Overview

Non-local means replaces each pixel with a weighted mean of pixels whose surrounding patches look alike, after Buades, Coll and Morel. Unlike a blur, it does not only average neighbors. It averages pixels anywhere in a search window whose surroundings match. Noise does not repeat, but edges and textures do, so they average with copies of themselves and stay sharp. The filter runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels. A noisy bright disk and gray square on a dark ground. With the defaults, the disk, the square and the ground are smooth and the edges sharp. With a strength of 10, much of the noise is left. With a strength of 16 and a noise sigma of 20, the result is smooth and sharp again.](../../assets/figures/nlm-light.svg#only-light){ width="480" }
  ![Four panels. A noisy bright disk and gray square on a dark ground. With the defaults, the disk, the square and the ground are smooth and the edges sharp. With a strength of 10, much of the noise is left. With a strength of 16 and a noise sigma of 20, the result is smooth and sharp again.](../../assets/figures/nlm-dark.svg#only-dark){ width="480" }
  <figcaption>A disk and a square with noise of sigma 20. Then non-local means with the defaults, with a strength h of 10, and with h 16 and a noise sigma of 20.</figcaption>
</figure>

## How it works

--8<-- "filters/nlm-steps.md"

## Mathematical foundation

--8<-- "filters/nlm-formula.md"

The weights compare whole patches, not single pixels, so one noisy pixel cannot fool them. A strength h well below the noise leaves most weights small, and little gets averaged. Telling the filter the noise sigma helps, since scikit-image then subtracts the distance that the noise alone adds to every patch pair.

## Kernel or operator

There is no fixed kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/nlm-params.md"

## Implementation

`nlm` in `engine/src/pixelnexus_engine/filters/edge_preserving.py` passes each plane of the channel scope, scaled from 0 to 1, to `skimage.restoration.denoise_nl_means`. The strength and the noise sigma are given in levels and divided by 255. The fast mode is the one of Darbon et al., which weighs every pixel of a patch the same and is much quicker.

## Worked example

--8<-- "examples/nlm.md"

At the default strength of 25.5 levels, the noise of sigma 20 drops from 22.22 dB to 43.18 dB. A strength of 10, half the noise, leaves most of it. With the noise sigma set, a strength of 16 does best here, close to the 0.8 sigma that scikit-image suggests.

## Complexity

--8<-- "filters/nlm-complexity.md"

## Artifacts and limitations

--8<-- "filters/nlm-limits.md"

## Tests

Each plane must match `denoise_nl_means` with the strength and sigma divided by 255. On a noisy step, the error must fall below 0.6 of the input's. The representation must have its three stages.

--8<-- "filters/nlm-tests.md"

## References

--8<-- "filters/nlm-references.md"
