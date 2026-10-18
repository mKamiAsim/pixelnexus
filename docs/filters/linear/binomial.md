# Binomial filter

--8<-- "filters/binomial-facts.md"

## Overview

The binomial filter blurs with weights taken from Pascal's triangle. The weights are whole numbers over a power of 2, so they are exact in binary arithmetic. For a size of 5 or more, the result is very close to a Gaussian blur.

<figure markdown="span">
  ![A line plot across a sharp edge. The binomial filter of size 9 and the Gaussian filter with sigma 1.41 give curves that lie on top of each other.](../../assets/figures/binomial-light.svg#only-light){ width="480" }
  ![A line plot across a sharp edge. The binomial filter of size 9 and the Gaussian filter with sigma 1.41 give curves that lie on top of each other.](../../assets/figures/binomial-dark.svg#only-dark){ width="480" }
  <figcaption>A binomial filter of size 9 and a Gaussian with sigma 1.41 blur an edge almost the same way.</figcaption>
</figure>

## How it works

1. Take a row of Pascal's triangle, such as 1, 4, 6, 4, 1 for size 5.
2. Divide it by its sum, 16, so the weights add up to 1.
3. Average every row of the image with these weights.
4. Average every column of that result with the same weights.

## Mathematical foundation

--8<-- "filters/binomial-formula.md"

The 1D weights are the binomial distribution with probability 1/2: the chance of k heads in n - 1 tosses of a fair coin. Its variance is (n - 1) / 4. By the central limit theorem the weights approach a Gaussian with that variance as n grows. So size 9 matches a Gaussian with sigma \(\sqrt{8/4} = \sqrt{2} \approx 1.41\), as the figure shows.

Row n - 1 of Pascal's triangle is also the result of convolving the pair \(\tfrac{1}{2}(1, 1)\) with itself n - 2 times. So the binomial filter equals averaging each pixel with its neighbor n - 1 times in a row. This is an exact identity, and a test checks it.

## Kernel or operator

The 1D weights and the 2D kernel for size 5, from the filter code.

--8<-- "kernels/binomial.md"

## Algorithm

--8<-- "filters/binomial-steps.md"

## Parameters

--8<-- "filters/binomial-params.md"

## Implementation

The filter runs as two 1D passes with the shared correlation code in `web/src/core/filters/convolve.ts`. On images with transparency, colors are averaged weighted by alpha. The studio splits the image into strips with a halo of (n - 1) / 2 pixels, so the strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/binomial.md"

## Complexity

--8<-- "filters/binomial-complexity.md"

## Artifacts and limitations

--8<-- "filters/binomial-limits.md"

## Tests

The test compares the filter with `scipy.ndimage.correlate1d` along both axes, with weights from `scipy.special.comb`, for sizes 3, 5 and 7 and all five border modes. Before writing the reference, the fixture script checks the weights against repeated averaging of two neighbors. The largest difference allowed is 1e-4 relative to the value.

--8<-- "filters/binomial-tests.md"

## References

--8<-- "filters/binomial-references.md"
