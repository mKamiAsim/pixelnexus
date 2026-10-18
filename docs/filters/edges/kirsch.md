# Kirsch compass

--8<-- "filters/kirsch-facts.md"

## Overview

The Kirsch operator turns one 3x3 mask in eight steps of 45 degrees and keeps the strongest response at each pixel. The strongest mask also gives the edge direction, to the nearest 45 degrees, with no arctangent.

<figure markdown="span">
  ![Three panels: disks, the largest Kirsch response with bright rings at the disk edges, and the direction map in which each disk ring shows eight bands of different gray.](../../assets/figures/kirsch-light.svg#only-light){ width="480" }
  ![Three panels: disks, the largest Kirsch response with bright rings at the disk edges, and the direction map in which each disk ring shows eight bands of different gray.](../../assets/figures/kirsch-dark.svg#only-dark){ width="480" }
  <figcaption>The largest response marks the edges. The direction map has eight values, one per mask.</figcaption>
</figure>

## How it works

1. Correlate the image with each of the eight masks.
2. Keep the largest response as the edge strength.
3. The direction of that mask is the edge direction.

## Mathematical foundation

--8<-- "filters/kirsch-formula.md"

The north mask weights the top row with 5 and the other ring cells with -3, so its weights add up to 0 and flat areas give 0. Moving the outer ring by one cell turns the mask by 45 degrees. The maximum over the eight masks is a nonlinear combination, unlike the magnitude of Sobel. The direction is measured like the Sobel direction, from dark to bright with y pointing down.

## Kernel or operator

The Inspector shows all eight masks, read from the code that turns them. The worked example below lists the eight responses for one window.

## Algorithm

--8<-- "filters/kirsch-steps.md"

## Parameters

--8<-- "filters/kirsch-params.md"

## Implementation

`compassFilter` in `web/src/core/filters/edges/compass.ts` builds the eight masks with `turnMask` and keeps the largest of the eight correlations. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope, alpha and the output mapping. By default it works on luma and gives a gray result.

## Worked example

--8<-- "examples/kirsch.md"

## Complexity

--8<-- "filters/kirsch-complexity.md"

## Artifacts and limitations

--8<-- "filters/kirsch-limits.md"

## Tests

The reference turns the mask the same way and correlates with `scipy.ndimage.correlate`. Before it is used, the script checks the west and north-west masks against their published form and that the eight masks add up to 0. The test covers both outputs for all five border modes.

--8<-- "filters/kirsch-tests.md"

## References

--8<-- "filters/kirsch-references.md"
