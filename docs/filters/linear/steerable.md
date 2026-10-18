# Steerable filters

--8<-- "filters/steerable-facts.md"

## Overview

Steerable filters turn a derivative of a Gaussian to any angle by mixing a few fixed basis filters. The first derivative needs two basis filters and responds to edges. The second needs three and responds to thin lines and ridges. Besides the response at one angle, the filter can give the strongest response over all angles and the angle where it is reached, both in closed form.

<figure markdown="span">
  ![Four panels: a Siemens star, the first derivative steered to 0 and to 45 degrees, each bright and dark where spokes cross its direction, and the strongest second derivative, which outlines every spoke.](../../assets/figures/steerable-light.svg#only-light){ width="480" }
  ![Four panels: a Siemens star, the first derivative steered to 0 and to 45 degrees, each bright and dark where spokes cross its direction, and the strongest second derivative, which outlines every spoke.](../../assets/figures/steerable-dark.svg#only-dark){ width="480" }
  <figcaption>Steerable derivatives of a Gaussian on a Siemens star. The first derivative at 0 and 45 degrees responds to spokes that cross those directions. The strongest second derivative responds to every spoke edge at once.</figcaption>
</figure>

## How it works

1. Filter the image with the derivatives of a Gaussian along x and y: two for the first derivative, three for the second.
2. For one angle, add the basis responses with weights built from the cosine and sine of the angle.
3. For the strongest response and its angle, solve for the best angle directly.

## Mathematical foundation

--8<-- "filters/steerable-formula.md"

Freeman and Adelson called a filter steerable when a few fixed basis filters can make every rotated copy of it. Derivatives of a Gaussian are steerable. The first derivative in direction theta is cos theta times the x derivative, plus sin theta times the derivative in the up direction. The second derivative needs three basis filters. Freeman and Adelson used three rotated copies, at 0, 60 and 120 degrees. This filter uses G_xx, G_xy and G_yy, which span the same filters and are separable. For the first derivative, the strongest response is the gradient magnitude. For the second, it is the Hessian eigenvalue with the largest size, and its angle is the direction of that eigenvector.

## Kernel or operator

The Inspector shows the two or three basis kernels with their separable factors, and the weight of each one at the current angle.

## Algorithm

--8<-- "filters/steerable-steps.md"

## Parameters

--8<-- "filters/steerable-params.md"

## Implementation

`steerableBasis` in `web/src/core/filters/linear/steerable.ts` correlates the plane with separable derivative-of-Gaussian kernels, built as in `scipy.ndimage.gaussian_filter` and cut at 4 sigma. `steeringWeights` gives the weights for an angle. The angle output pins the ends of its range, so a zero that rounds to a tiny negative or positive value gives one answer. It is 0 where the response does not depend on the angle. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope, alpha and the output mapping. By default it works on luma.

## Worked example

--8<-- "examples/steerable.md"

## Complexity

--8<-- "filters/steerable-complexity.md"

## Artifacts and limitations

--8<-- "filters/steerable-limits.md"

## Tests

The reference runs `scipy.ndimage.gaussian_filter` with derivative orders and steers with NumPy, with the same rules for the angle output. Before the cases are written, the script checks a tilted ramp. The steered first derivative equals its slope along the ramp and 0 across it, and the angle output finds the direction of the ramp. The cases cover both derivatives and all three outputs for all five border modes.

--8<-- "filters/steerable-tests.md"

## References

--8<-- "filters/steerable-references.md"
