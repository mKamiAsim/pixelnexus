# Difference of Gaussians

--8<-- "filters/dog-facts.md"

## Overview

The Difference of Gaussians, DoG, subtracts a wide Gaussian blur from a narrow one. The narrow blur keeps details that the wide blur removes, so the difference keeps only details between the two sizes. It is a band-pass filter, a cheap stand-in for the Laplacian of Gaussian, and the basis of many blob and feature detectors.

<figure markdown="span">
  ![Three panels: bright disks and dots on a dark background, the DoG with sigma 1 that outlines the small dots and edges, and the DoG with sigma 4 that responds to the larger disks.](../../assets/figures/dog-light.svg#only-light){ width="480" }
  ![Three panels: bright disks and dots on a dark background, the DoG with sigma 1 that outlines the small dots and edges, and the DoG with sigma 4 that responds to the larger disks.](../../assets/figures/dog-dark.svg#only-dark){ width="480" }
  <figcaption>A small sigma keeps the small dots and thin edges. A large sigma responds to the large disks.</figcaption>
</figure>

## How it works

1. Blur the image with a narrow Gaussian.
2. Blur it with a wide Gaussian, k times wider.
3. Subtract the wide blur from the narrow one.

## Mathematical foundation

--8<-- "filters/dog-formula.md"

Both Gaussians are normalized, so the difference kernel adds up to 0 and flat areas give 0. In the frequency domain the DoG is the difference of two low-pass filters, a band-pass that peaks at a frequency set by sigma and k. For k near 1, G(k sigma) - G(sigma) is close to (k - 1) sigma^2 times the Laplacian of Gaussian. Marr and Hildreth found that k = 1.6 gives a close match to the LoG.

## Kernel or operator

The Inspector shows the difference kernel, built from the two Gaussian kernels of the code. The Impulse response demo in the Learn panel shows its center-surround shape.

## Algorithm

--8<-- "filters/dog-steps.md"

## Parameters

--8<-- "filters/dog-params.md"

## Implementation

`dogFilter` in `web/src/core/filters/linear/dog-log.ts` runs two separable Gaussian blurs, truncated at 3 sigma like the Gaussian filter, and subtracts them. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope, alpha and the output mapping. By default it works on luma and gives a gray result.

## Worked example

--8<-- "examples/dog.md"

## Complexity

--8<-- "filters/dog-complexity.md"

## Artifacts and limitations

--8<-- "filters/dog-limits.md"

## Tests

The reference subtracts two `scipy.ndimage.gaussian_filter` results with truncate 3. Before it is used, the script checks it against `skimage.filters.difference_of_gaussians`. The test covers two sigma and ratio settings for all five border modes.

--8<-- "filters/dog-tests.md"

## References

--8<-- "filters/dog-references.md"
