# SUSAN noise filter

--8<-- "filters/susan-smoothing-facts.md"

## Overview

The SUSAN noise filter averages each pixel with neighbors of similar brightness, after Smith and Brady. The weights fall with distance and with the brightness difference. The pixel itself is left out, so a single noisy pixel cannot keep its own value. Where no neighbor is similar at all, the pixel takes the median of its 8 neighbors. The filter runs in the PixelNexus engine, with our own code.

<figure markdown="span">
  ![Four panels. A noisy bright disk and gray square on a dark ground. With a threshold of 20, the noise is a little softer. With a threshold of 40, the areas are much smoother and the edges stay sharp. With a threshold of 10, the result looks almost like the input.](../../assets/figures/susan-smoothing-light.svg#only-light){ width="480" }
  ![Four panels. A noisy bright disk and gray square on a dark ground. With a threshold of 20, the noise is a little softer. With a threshold of 40, the areas are much smoother and the edges stay sharp. With a threshold of 10, the result looks almost like the input.](../../assets/figures/susan-smoothing-dark.svg#only-dark){ width="480" }
  <figcaption>A disk and a square with noise of sigma 20. Then the SUSAN noise filter with a brightness threshold of 20, 40 and 10.</figcaption>
</figure>

## How it works

--8<-- "filters/susan-smoothing-steps.md"

## Mathematical foundation

--8<-- "filters/susan-smoothing-formula.md"

The weight is the product of two Gaussians, one in space and one in brightness. It is close to a bilateral filter, with two differences. The center pixel is left out, which removes single noisy pixels. And when no neighbor is similar enough that a weight remains, the median of the 8 neighbors takes over. Smith and Brady called the set of similar neighbors the univalue segment assimilating nucleus, the USAN.

## Kernel or operator

There is no fixed kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/susan-smoothing-params.md"

## Implementation

`susan_smoothing` in `engine/src/pixelnexus_engine/filters/edge_preserving.py` is our own code, following the rule of Smith and Brady. The window reaches ceil(2 sigma) pixels in each direction, and the plane is padded by repeating its edge pixels. Both are our choices. In floating point, a weight is only exactly 0 when the brightness difference is more than about 27 times the threshold, so the median fallback is rare.

## Worked example

--8<-- "examples/susan-smoothing.md"

The threshold has to sit above the noise. At 10, half the noise sigma, little changes. At 40, twice the noise sigma, the PSNR rises by 8 dB and the edges, of 110 to 140 levels, still hold. The spatial sigma matters little here.

## Complexity

--8<-- "filters/susan-smoothing-complexity.md"

## Artifacts and limitations

--8<-- "filters/susan-smoothing-limits.md"

## Tests

The result must match a direct loop over the window to 1e-12. A single bright pixel must take the value of its neighbors, and a pixel with no similar neighbor must take their median. The representation must have its three stages.

--8<-- "filters/susan-smoothing-tests.md"

## References

--8<-- "filters/susan-smoothing-references.md"
