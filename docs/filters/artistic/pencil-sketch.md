# Pencil sketch

--8<-- "filters/pencil-sketch-facts.md"

## Overview

The pencil sketch turns the image into a light drawing. Flat areas turn white, and edges and dark details stay as gray lines. It blends the luma with its own blurred negative by color dodge, a blend mode of the W3C Compositing and Blending spec.

<figure markdown="span">
  ![Two panels: a test scene with a blue sky, green ground and red, yellow and blue disks, and the pencil sketch, white with gray outlines of the disks and the horizon.](../../assets/figures/pencil-sketch-light.svg#only-light){ width="480" }
  ![Two panels: a test scene with a blue sky, green ground and red, yellow and blue disks, and the pencil sketch, white with gray outlines of the disks and the horizon.](../../assets/figures/pencil-sketch-dark.svg#only-dark){ width="480" }
  <figcaption>A test scene, and the pencil sketch with blur 3.</figcaption>
</figure>

## How it works

1. Compute the luma and invert it.
2. Blur the inverted image with a Gaussian.
3. Divide the luma by one minus the blurred negative, capped at white.

## Mathematical foundation

--8<-- "filters/pencil-sketch-formula.md"

Where the image is flat, the blurred negative equals the negative, 1 - Y in the range 0 to 1. Then the dodge Y / (1 - B) equals Y / Y = 1, white. Near an edge, the blur mixes in the other side. On the dark side the negative is lowered by the bright neighbors, so the ratio stays below 1 and a gray line appears.

## Kernel or operator

The Inspector shows the steps of the effect as formulas with the current settings.

## Algorithm

--8<-- "filters/pencil-sketch-steps.md"

## Parameters

--8<-- "filters/pencil-sketch-params.md"

## Implementation

`pencilSketchFilter` in `web/src/core/filters/artistic/painterly.ts` uses `sketchPlane` and `colorDodge`.

## Worked example

--8<-- "examples/pencil-sketch.md"

## Complexity

--8<-- "filters/pencil-sketch-complexity.md"

## Artifacts and limitations

--8<-- "filters/pencil-sketch-limits.md"

## Tests

The reference writes the blur and the dodge again with NumPy and SciPy, and compares every output value on the test images of the fixtures. Unit tests check the dodge at the special cases of the spec.

--8<-- "filters/pencil-sketch-tests.md"

## References

--8<-- "filters/pencil-sketch-references.md"
