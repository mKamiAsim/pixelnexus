# Frei-Chen

--8<-- "filters/frei-chen-facts.md"

## Overview

The Frei-Chen operator splits each 3x3 window into nine standard patterns: four edges, four lines and the mean. It reports how much of the window, as a share, looks like an edge or like a line. Because it is a share, a faint edge and a strong edge of the same shape give the same result.

<figure markdown="span">
  ![Three panels: disks, the Frei-Chen edge subspace output with bright rings at the disk borders, and the line subspace output with bright thin dots.](../../assets/figures/frei-chen-light.svg#only-light){ width="480" }
  ![Three panels: disks, the Frei-Chen edge subspace output with bright rings at the disk borders, and the line subspace output with bright thin dots.](../../assets/figures/frei-chen-dark.svg#only-dark){ width="480" }
  <figcaption>The edge subspace lights up on the disk borders, the line subspace on the thin dots.</figcaption>
</figure>

## How it works

1. Correlate the window with the nine orthonormal masks.
2. Add up the squared responses of the edge masks, or of the line masks.
3. Divide by the sum of all nine and take the square root.

## Mathematical foundation

--8<-- "filters/frei-chen-formula.md"

The nine masks are an orthonormal basis of 3x3 windows, so the squared responses add up to the energy of the window. The ratio of the edge energy to the total is the squared cosine of the angle between the window, seen as a 9-dimensional vector, and the edge subspace. The output is 255 times that cosine. In flat areas the energy is tiny, so small noise patterns can still give a large share.

## Kernel or operator

The Inspector shows the nine masks, read from the code. The worked example below projects one window.

## Algorithm

--8<-- "filters/frei-chen-steps.md"

## Parameters

--8<-- "filters/frei-chen-params.md"

## Implementation

`freiChenFilter` in `web/src/core/filters/edges/compass.ts` correlates with the nine masks and forms the ratio. A window with no energy gives 0. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope, alpha and the output mapping. By default it works on luma and gives a gray result.

## Worked example

--8<-- "examples/frei-chen.md"

## Complexity

--8<-- "filters/frei-chen-complexity.md"

## Artifacts and limitations

--8<-- "filters/frei-chen-limits.md"

## Tests

The reference projects onto the same nine masks. Before it is used, the script checks that the masks are orthonormal. The test covers both outputs for all five border modes.

--8<-- "filters/frei-chen-tests.md"

## References

--8<-- "filters/frei-chen-references.md"
