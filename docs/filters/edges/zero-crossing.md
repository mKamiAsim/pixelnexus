# Zero-crossing detector

--8<-- "filters/zero-crossing-facts.md"

## Overview

The zero-crossing detector marks the pixels where a signed response changes sign. Its input is a result such as a Laplacian, saved with the offset mapping so that 128 means zero. Applied to a second-derivative response, the crossings lie on the edges and form thin, closed lines.

## How it works

1. Subtract the zero level from each value.
2. Find negative pixels with a positive neighbor.
3. Mark them when the jump is above the threshold.

## Mathematical foundation

--8<-- "filters/zero-crossing-formula.md"

On a smooth edge the first derivative peaks and the second derivative passes through zero. On a pixel grid the exact zero falls between two pixels, so a detector must choose which pixel to mark. This filter marks the negative one, which keeps the lines one pixel thick. The threshold on the jump removes crossings caused by small noise.

## Kernel or operator

There is no kernel. The Inspector shows the rule with the current level and threshold. The worked example below is in the Marr-Hildreth page, which uses the same rule.

## Algorithm

--8<-- "filters/zero-crossing-steps.md"

## Parameters

--8<-- "filters/zero-crossing-params.md"

## Implementation

`zeroCrossings` in `web/src/core/filters/edges/zero-crossing.ts` checks the four neighbors of each negative pixel. The filter extends the plane by one pixel with the border mode first. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope, alpha and the output mapping. By default it works on luma and gives a gray mask.

## Worked example

--8<-- "examples/zero-crossing.md"

## Complexity

--8<-- "filters/zero-crossing-complexity.md"

## Artifacts and limitations

--8<-- "filters/zero-crossing-limits.md"

## Tests

The reference applies the same rule with NumPy. The test covers two levels and thresholds for all five border modes.

--8<-- "filters/zero-crossing-tests.md"

## References

--8<-- "filters/zero-crossing-references.md"
