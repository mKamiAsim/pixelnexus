# Triangular filter

--8<-- "filters/triangular-facts.md"

## Overview

The triangular filter, also called the tent filter, blurs with weights that rise in equal steps to the center and fall again. It costs no more than a box filter of the same size, and it treats fine patterns better: they fade instead of coming back with reversed contrast.

<figure markdown="span">
  ![Three panels: a zone plate, the same zone plate after a 9x9 box filter, and after a 9x9 tent filter. The box shows faint reversed rings at the outside. The tent fades them out.](../../assets/figures/triangular-light.svg#only-light){ width="480" }
  ![Three panels: a zone plate, the same zone plate after a 9x9 box filter, and after a 9x9 tent filter. The box shows faint reversed rings at the outside. The tent fades them out.](../../assets/figures/triangular-dark.svg#only-dark){ width="480" }
  <figcaption>The tent filter fades the fine rings of a zone plate. The box filter of the same size brings some back reversed.</figcaption>
</figure>

## How it works

1. Give the center pixel the largest weight, r + 1.
2. Give each step away from the center one unit less, down to 1 at the edge of the window.
3. Divide by the sum, (r + 1) squared.
4. Average along every row, then along every column.

## Mathematical foundation

--8<-- "filters/triangular-formula.md"

A box of width r + 1 convolved with itself is a triangle of width 2r + 1. So the tent filter equals two box filters in a row. The fixture script checks this identity before it writes the reference data.

In frequency, a box is a sinc, which has negative lobes. A product of two equal sincs is a squared sinc, which is never negative. That is why the tent filter does not reverse the contrast of fine patterns, while the box filter does.

## Kernel or operator

The 1D weights and the 2D kernel for size 5, from the filter code.

--8<-- "kernels/triangular.md"

## Algorithm

--8<-- "filters/triangular-steps.md"

## Parameters

--8<-- "filters/triangular-params.md"

## Implementation

The filter runs as two 1D passes with the shared correlation code in `web/src/core/filters/convolve.ts`. On images with transparency, colors are averaged weighted by alpha. The studio splits the image into strips with a halo of r pixels, so the strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/triangular.md"

## Complexity

--8<-- "filters/triangular-complexity.md"

## Artifacts and limitations

--8<-- "filters/triangular-limits.md"

## Tests

The test compares the filter with `scipy.ndimage.correlate1d` along both axes for sizes 3, 5 and 7 and all five border modes. The fixture script first checks the tent weights against the convolution of two boxes. The largest difference allowed is 1e-4 relative to the value.

--8<-- "filters/triangular-tests.md"

## References

--8<-- "filters/triangular-references.md"
