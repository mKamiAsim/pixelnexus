# Bokeh blur

--8<-- "filters/bokeh-facts.md"

## Overview

Bokeh is the look of the out-of-focus parts of a photo. A lens spreads each point of light into a disk, so small lights become bright circles. This filter blurs with a disk in linear light and first boosts the highlights, which a photo usually clips.

<figure markdown="span">
  ![Two panels: small colored lights on a dark blue background, and the same lights blurred into soft round disks, the white ones bright.](../../assets/figures/bokeh-light.svg#only-light){ width="480" }
  ![Two panels: small colored lights on a dark blue background, and the same lights blurred into soft round disks, the white ones bright.](../../assets/figures/bokeh-dark.svg#only-dark){ width="480" }
  <figcaption>Small lights on a dark background, and the bokeh blur with radius 8 and highlight boost 6.</figcaption>
</figure>

## How it works

1. Decode the image to linear light.
2. Scale up the highlights, smoothly from the threshold to white.
3. Blur with a disk kernel.
4. Encode again and clip.

## Mathematical foundation

--8<-- "filters/bokeh-formula.md"

In the thin lens model of Potmesil and Chakravarty, a point out of focus images to a disk, the circle of confusion. Blurring with a disk kernel imitates that for one depth. A clipped highlight has lost its true brightness, so a disk blur alone would spread it into a dim disk. The boost puts back some of the lost light.

## Kernel or operator

The Inspector shows the steps of the effect as formulas with the current settings.

## Algorithm

--8<-- "filters/bokeh-steps.md"

## Parameters

--8<-- "filters/bokeh-params.md"

## Implementation

`bokehFilter` in `web/src/core/filters/artistic/lens.ts` uses `bokehPlanes` and the disk kernel of the disk averaging filter.

## Worked example

--8<-- "examples/bokeh.md"

## Complexity

--8<-- "filters/bokeh-complexity.md"

## Artifacts and limitations

--8<-- "filters/bokeh-limits.md"

## Tests

The reference writes the boost and the disk blur again with NumPy and SciPy, and compares every output value on the test images of the fixtures.

--8<-- "filters/bokeh-tests.md"

## References

--8<-- "filters/bokeh-references.md"
