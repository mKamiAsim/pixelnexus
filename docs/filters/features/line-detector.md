# Line detectors

--8<-- "filters/line-detector-facts.md"

## Overview

The line detectors are four 3x3 masks from Gonzalez and Woods that answer most strongly to a thin bright line: horizontal, vertical, and the two diagonals. Use one mask to find lines in one direction, or the strongest of the four to find lines in any of them.

<figure markdown="span">
  ![Three panels: thin bright lines in four directions on a dark background, the horizontal mask that keeps only the horizontal line, and the strongest of the four masks that keeps all lines.](../../assets/figures/line-detector-light.svg#only-light){ width="480" }
  ![Three panels: thin bright lines in four directions on a dark background, the horizontal mask that keeps only the horizontal line, and the strongest of the four masks that keeps all lines.](../../assets/figures/line-detector-dark.svg#only-dark){ width="480" }
  <figcaption>The horizontal mask finds only the horizontal line. The strongest of the four finds all of them.</figcaption>
</figure>

## How it works

1. Weight the pixels along a direction by 2 and the others by -1.
2. Add up the weighted window. Flat areas give 0.
3. Keep the response of one mask, or the largest of the four.

## Mathematical foundation

--8<-- "filters/line-detector-formula.md"

Each mask is a matched filter for a one-pixel line: the pattern it responds to most is the line itself. Its weights add up to 0, so it ignores the local brightness. A bright line gives a positive response and a dark line a negative one. The clip mapping keeps only bright lines. Edges give a weaker response than lines, but not zero.

## Kernel or operator

The Inspector shows the kernels that run, read from the same code. The Impulse response demo in the Learn panel shows how one bright pixel spreads through them.

## Algorithm

--8<-- "filters/line-detector-steps.md"

## Parameters

--8<-- "filters/line-detector-params.md"

## Implementation

`lineDetectorFilter` in `web/src/core/filters/edges/compass.ts` correlates with one mask, or with all four and keeps the maximum. This entry covers the four masks of Gonzalez and Woods. Other line mask families are not included. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope, alpha and the output mapping. By default it works on luma and gives a gray result.

## Worked example

--8<-- "examples/line-detector.md"

## Complexity

--8<-- "filters/line-detector-complexity.md"

## Artifacts and limitations

--8<-- "filters/line-detector-limits.md"

## Tests

The reference correlates with the four masks. The test covers the maximum and one diagonal mask for all five border modes.

--8<-- "filters/line-detector-tests.md"

## References

--8<-- "filters/line-detector-references.md"
