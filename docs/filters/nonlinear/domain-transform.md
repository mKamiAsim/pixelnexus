# Domain transform filter

--8<-- "filters/domain-transform-facts.md"

## Overview

The domain transform smooths an image while keeping its edges, after Gastal and Oliveira. It stretches each row and column where the colors change, so pixels on two sides of an edge end up far apart. A fast 1-D filter in that stretched domain then smooths each side on its own. Its cost does not grow with the sigmas, which makes it much faster than a bilateral filter with a large reach. The filter runs in the PixelNexus engine, with OpenCV.

<figure markdown="span">
  ![Four panels. A noisy bright disk and gray square on a dark ground. With the defaults, the noise is a little softer and the edges stay sharp. With a color sigma of 40, the result looks almost like the input. With the recursive filter, the noise is a little softer again.](../../assets/figures/domain-transform-light.svg#only-light){ width="480" }
  ![Four panels. A noisy bright disk and gray square on a dark ground. With the defaults, the noise is a little softer and the edges stay sharp. With a color sigma of 40, the result looks almost like the input. With the recursive filter, the noise is a little softer again.](../../assets/figures/domain-transform-dark.svg#only-dark){ width="480" }
  <figcaption>A disk and a square with noise of sigma 20. Then the domain transform with the defaults, with a color sigma of 40, and with the recursive filter.</figcaption>
</figure>

## How it works

--8<-- "filters/domain-transform-steps.md"

## Mathematical foundation

--8<-- "filters/domain-transform-formula.md"

The stretch turns edge-aware smoothing into ordinary smoothing along a curved axis. In flat areas the axis is unchanged, so the filter is a plain blur there. Across an edge, the axis jumps by the color change times sigma s over sigma r, so the blur cannot reach across. The passes alternate between rows and columns. Each pass uses a smaller sigma, chosen so that the passes together smooth with sigma s.

## Kernel or operator

There is no fixed kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/domain-transform-params.md"

## Implementation

`domain_transform` in `engine/src/pixelnexus_engine/filters/edge_preserving.py` calls `cv2.ximgproc.dtFilter` on the 8-bit RGB image, guided by itself. The color change between neighbors adds up over the three channels.

## Worked example

--8<-- "examples/domain-transform.md"

The domain transform is an edge-aware smoother, not a denoiser. Noise of sigma 20 makes color changes as large as weak edges, so at a color sigma of 40 the filter keeps almost all of it. At 120, the noise counts as flat, and the PSNR rises to 32.9 dB. The spatial sigma matters far less.

## Complexity

--8<-- "filters/domain-transform-complexity.md"

## Artifacts and limitations

--8<-- "filters/domain-transform-limits.md"

## Tests

The result must equal OpenCV's own call. On a clean step, the two sides must stay exactly 60 and 190. The representation must have its three stages.

--8<-- "filters/domain-transform-tests.md"

## References

--8<-- "filters/domain-transform-references.md"
