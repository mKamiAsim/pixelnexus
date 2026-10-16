# Shen-Castan

--8<-- "filters/shen-castan-facts.md"

## Overview

The Shen-Castan detector smooths the image with the infinite symmetric exponential filter (ISEF). Shen and Castan showed this filter is optimal for step edges under their criteria. Edges are then found where the smoothed image crosses the original. The ISEF runs as a recursion, a pass forward and a pass backward along each row and column, so its cost stays the same at any amount of smoothing. The filter runs in the PixelNexus engine.

<figure markdown="span">
  ![Four panels. A noisy bright disk and gray square on a dark ground. The binary Laplacian is white and black speckle on the flat areas, with a solid white ring just outside each shape and a mostly black inside. With b 0.6, the edges trace both outlines with many short spurs. With b 0.8, the outlines are thin and clean, with a few stray dots.](../../assets/figures/shen-castan-light.svg#only-light){ width="480" }
  ![Four panels. A noisy bright disk and gray square on a dark ground. The binary Laplacian is white and black speckle on the flat areas, with a solid white ring just outside each shape and a mostly black inside. With b 0.6, the edges trace both outlines with many short spurs. With b 0.8, the outlines are thin and clean, with a few stray dots.](../../assets/figures/shen-castan-dark.svg#only-dark){ width="480" }
  <figcaption>A disk and a square with noise of sigma 10. Then the binary Laplacian with b 0.8, and the edges with b 0.6 and 0.8.</figcaption>
</figure>

## How it works

--8<-- "filters/shen-castan-steps.md"

## Mathematical foundation

--8<-- "filters/shen-castan-formula.md"

The ISEF in one dimension is (1 - b) / (1 + b) times b to the power |n|. A forward recursion with the factor b gives the right half of this kernel, and a backward recursion gives the left half. Their sum counts the center twice, so the center is subtracted once. Each recursion costs two operations per pixel at any b.

The smoothed image minus the original acts as a Laplacian limited to a band of frequencies. Near a step, smoothing lifts the dark side and lowers the bright side. So the sign changes right at the step, and the border of the positive region marks the edge.

## Kernel or operator

The kernel has no finite size. The filter is recursive. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/shen-castan-params.md"

## Implementation

`shen_castan` in `engine/src/pixelnexus_engine/filters/shen_castan.py` runs both recursions with `scipy.signal.lfilter`. Each starts in the steady state of the first pixel, which acts as if the edge pixels went on forever. The paper's own last steps are an adaptive gradient in a window, then hysteresis and thinning. The sources we could read describe them only in outline. So our version is simpler. It takes the gradient of the smoothed image by central differences at the zero crossings, and keeps edges with `skimage.filters.apply_hysteresis_threshold`. The thresholds are in levels per pixel.

## Worked example

--8<-- "examples/shen-castan.md"

Smoothing trades stray edges for weaker ones. At b 0.8, edges reach 99.4 percent of the outline, and half of the edge pixels lie near it. At b 0.9, 86.4 percent lie near the outline, but they cover only 34.1 percent of it. At b 0.95, no edge passes. The gradient of the smoothed image falls as b grows, so the default thresholds are too high there. Lower them when you raise b.

## Complexity

--8<-- "filters/shen-castan-complexity.md"

## Artifacts and limitations

--8<-- "filters/shen-castan-limits.md"

## Tests

The recursion must equal a direct convolution with the published kernel, at three values of b, with the edge pixels repeated. A flat image must stay flat. At a step, the Laplacian must be positive on the dark side and negative on the bright side, with the zero crossing on the dark side. On a noisy disk, the edges must go all the way around, with more than 85 percent within 2 pixels of the circle. More smoothing must leave fewer zero crossings on noise. Each output must show its stage, and the representation must have its three stages.

--8<-- "filters/shen-castan-tests.md"

## References

--8<-- "filters/shen-castan-references.md"
