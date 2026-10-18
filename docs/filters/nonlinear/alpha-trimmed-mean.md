# Alpha-trimmed mean filter

--8<-- "filters/alpha-trimmed-mean-facts.md"

## Overview

The alpha-trimmed mean filter sorts each window, drops the t smallest and the t largest values, and averages the rest. With t = 0 it is the box filter, and with the largest t it is the median. Values between suit images with both impulse noise and Gaussian noise.

<figure markdown="span">
  ![Four panels in two rows: disks with Gaussian noise and specks, a 3x3 box filter that smears the specks, a 3x3 median that removes them but stays grainy, and a trimmed mean with t = 2 that removes the specks and smooths the grain.](../../assets/figures/alpha-trimmed-mean-light.svg#only-light){ width="480" }
  ![Four panels in two rows: disks with Gaussian noise and specks, a 3x3 box filter that smears the specks, a 3x3 median that removes them but stays grainy, and a trimmed mean with t = 2 that removes the specks and smooths the grain.](../../assets/figures/alpha-trimmed-mean-dark.svg#only-dark){ width="480" }
  <figcaption>With Gaussian noise and specks, trimming drops the specks and averages the rest.</figcaption>
</figure>

## How it works

1. Take the square window around the pixel and sort its values.
2. Drop the t smallest and the t largest values.
3. Write the mean of the values that are left.

## Mathematical foundation

--8<-- "filters/alpha-trimmed-mean-formula.md"

The trimmed mean is an L-estimator: a weighted sum of order statistics. Here the weights are 1 / (n - 2t) for the ranks t + 1 to n - t and 0 for the rest. Gonzalez and Woods write d = 2t for the number of dropped values. As long as a window holds at most t impulses of each kind, they are all dropped, and the mean of the rest smooths the Gaussian noise.

## Kernel or operator

The Inspector shows the window, the number of values and the rank that is used. The Rank stepper in the Learn panel shows the sorted window at any pixel and the value the filter gives there. Here a run of ranks is marked, the values that are averaged.

## Algorithm

--8<-- "filters/alpha-trimmed-mean-steps.md"

## Parameters

--8<-- "filters/alpha-trimmed-mean-params.md"

## Implementation

`alphaTrimmedMeanFilter` in `web/src/core/filters/nonlinear/means.ts` reads the sliding histogram of `histogramPlane`. It skips t values from the bottom, adds up the next n - 2t values and divides by n - 2t. The trim is limited to (n - 1) / 2, so at least one value is left. Values are whole numbers. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/alpha-trimmed-mean.md"

## Complexity

--8<-- "filters/alpha-trimmed-mean-complexity.md"

## Artifacts and limitations

--8<-- "filters/alpha-trimmed-mean-limits.md"

## Tests

The reference sorts each window with NumPy. Before it is used, it is checked against two limits: with t = 0 it must equal `scipy.ndimage.uniform_filter`, and with the largest t it must equal `scipy.ndimage.median_filter`. The test covers three window and trim settings for all five border modes.

--8<-- "filters/alpha-trimmed-mean-tests.md"

## References

--8<-- "filters/alpha-trimmed-mean-references.md"
