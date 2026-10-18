# Scharr

--8<-- "filters/scharr-facts.md"

## Overview

The Scharr operator estimates the gradient with 3x3 kernels whose smoothing weights are 3, 10, 3. Scharr chose these weights so that the gradient direction is as accurate as a 3x3 kernel allows, in every direction. The edge strength is nearly the same for edges at any angle.

<figure markdown="span">
  ![Two panels: a Siemens star and its Scharr gradient magnitude, with even brightness along spokes of every direction.](../../assets/figures/scharr-light.svg#only-light){ width="480" }
  ![Two panels: a Siemens star and its Scharr gradient magnitude, with even brightness along spokes of every direction.](../../assets/figures/scharr-dark.svg#only-dark){ width="480" }
  <figcaption>The Scharr magnitude is nearly the same for spokes in every direction.</figcaption>
</figure>

## How it works

1. Take the difference across the edge.
2. Average along the edge with the weights 3, 10, 3.
3. Combine the two directions into the magnitude or the direction.

## Mathematical foundation

--8<-- "filters/scharr-formula.md"

Like Sobel, each kernel is a central difference times a smoothing, but the smoothing 3, 10, 3 was optimized to make the gradient direction error small for all orientations. OpenCV uses these weights without normalization, and so does this filter. scikit-image divides them by 32, so its values are 32 times smaller.

## Kernel or operator

The Inspector shows the kernels that run, read from the same code. The Impulse response demo in the Learn panel shows how one bright pixel spreads through them.

## Algorithm

--8<-- "filters/scharr-steps.md"

## Parameters

--8<-- "filters/scharr-params.md"

## Implementation

`scharrFilter` in `web/src/core/filters/edges/gradients.ts` runs each kernel as two 1D passes and combines the results like the Sobel filter. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope, alpha and the output mapping. By default it works on luma and gives a gray result.

## Worked example

--8<-- "examples/scharr.md"

## Complexity

--8<-- "filters/scharr-complexity.md"

## Artifacts and limitations

--8<-- "filters/scharr-limits.md"

## Tests

The reference correlates with the two kernels. Before it is used, the script checks the horizontal kernel against `cv2.Scharr`. The test covers all outputs for all five border modes.

--8<-- "filters/scharr-tests.md"

## References

--8<-- "filters/scharr-references.md"
