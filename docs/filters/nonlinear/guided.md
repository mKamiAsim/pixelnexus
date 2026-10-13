# Guided filter

--8<-- "filters/guided-facts.md"

## Overview

The guided filter assumes that, in every small window, the output is a straight-line function of a guide image: a times the guide plus b. It fits a and b to the input in each window. In flat windows the best slope is near 0, so the output is the window mean and the noise is gone. In windows with an edge the slope is near 1, so the edge stays. All steps are box means, so the cost does not depend on the radius. Here the guide is the image itself.

<figure markdown="span">
  ![A plot of one row across a noisy step edge. With eps 0.01 the guided filter keeps the step and some noise. With eps 0.1 it smooths more of the noise and rounds the step a little.](../../assets/figures/guided-light.svg#only-light){ width="480" }
  ![A plot of one row across a noisy step edge. With eps 0.01 the guided filter keeps the step and some noise. With eps 0.1 it smooths more of the noise and rounds the step a little.](../../assets/figures/guided-dark.svg#only-dark){ width="480" }
  <figcaption>A small eps keeps the edge and some noise. A larger eps smooths more of both.</figcaption>
</figure>

## How it works

1. In each window, find the mean and variance of the guide and its covariance with the input.
2. Compute the slope a and offset b of the best straight line, with a penalty eps on the slope.
3. For each pixel, average a and b over all windows that hold it, and write a times the guide plus b.

## Mathematical foundation

--8<-- "filters/guided-formula.md"

The slope is the ridge regression solution a = cov(I, p) / (var(I) + eps). With the input as its own guide, cov(I, p) is the variance, so a = var / (var + eps). Detail whose variance is well below eps gets a near 0 and is smoothed. Detail with much more variance gets a near 1 and is kept. He, Sun and Tang show that the result equals a filter kernel that depends on the guide, and that it avoids the gradient reversal of the bilateral filter.

## Kernel or operator

The Inspector shows the model with the current eps. The worked example below computes a and b for a flat window and an edge window.

## Algorithm

--8<-- "filters/guided-steps.md"

## Parameters

--8<-- "filters/guided-params.md"

## Implementation

`guidedPlane` in `web/src/core/filters/nonlinear/guided.ts` computes six box means in float64 with running sums. The output needs twice the radius around each pixel, because a and b are averaged once more. So the plane is extended once by twice the radius with the border mode, filtered, and cut. For the reflect modes and wrap, this equals applying the border rule to every box mean. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/guided.md"

## Complexity

--8<-- "filters/guided-complexity.md"

## Artifacts and limitations

--8<-- "filters/guided-limits.md"

## Tests

The reference uses `scipy.ndimage.uniform_filter` on the extended plane. Before it is used, the script checks it against `cv2.ximgproc.guidedFilter`, which uses the reflect mode, within 0.01. The test covers three radius and eps settings for all five border modes.

--8<-- "filters/guided-tests.md"

## References

--8<-- "filters/guided-references.md"
