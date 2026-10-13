# Joint bilateral filter

--8<-- "filters/joint-bilateral-facts.md"

## Overview

The joint bilateral filter, also called the cross bilateral filter, smooths one image along the edges of another. It works like the bilateral filter, but the weight that protects edges compares the pixels of a guide image instead of the image itself. So a noisy photo can be cleaned with the edges of a sharper photo of the same scene, such as a flash photo. Without a guide image, the luma of the image itself guides, which smooths colors along brightness edges.

<figure markdown="span">
  ![Three panels: disks with strong noise, a bilateral filter result that is still noisy and blurred because the noise hides the edges, and the joint bilateral result with the clean image as the guide, smooth with sharp disk edges.](../../assets/figures/joint-bilateral-light.svg#only-light){ width="480" }
  ![Three panels: disks with strong noise, a bilateral filter result that is still noisy and blurred because the noise hides the edges, and the joint bilateral result with the clean image as the guide, smooth with sharp disk edges.](../../assets/figures/joint-bilateral-dark.svg#only-dark){ width="480" }
  <figcaption>The noise hides the edges, so the bilateral filter cannot find them. With the clean image as the guide, the joint bilateral filter keeps them.</figcaption>
</figure>

## How it works

1. Give each neighbor a weight that falls with its distance.
2. Multiply it by a weight that falls with the difference between the guide pixels.
3. Write the weighted mean of the image values.

## Mathematical foundation

--8<-- "filters/joint-bilateral-formula.md"

Only the value weight changes from the bilateral filter: it uses the guide G, not the image I. So the filter keeps the edges of G, and averages I within the regions of G. With the image itself as the guide and the color difference, it is the bilateral filter in its color mode. Petschnigg and others, and Eisemann and Durand, introduced it in 2004 for flash and no-flash pairs. The flash photo has low noise and clear edges. The no-flash photo has the natural light.

## Kernel or operator

The Inspector shows the weight formula with the current parameters. The worked example below shows how a guide edge removes one column of the window.

## Algorithm

--8<-- "filters/joint-bilateral-steps.md"

## Parameters

--8<-- "filters/joint-bilateral-params.md"

## Implementation

`jointBilateralFilter` in `web/src/core/filters/nonlinear/bilateral.ts` shares `bilateralPlanes` with the bilateral filter and hands it the guide planes for the value weight. The guide comes from a new image parameter: Properties lists the open images of the same size. The browser engine pads the guide like the image for every strip, sends both to the worker, and the filter framework passes the guide planes to the filter. The live preview scales the guide with the image. The filter runs in the browser engine, in Web Workers.

## Worked example

--8<-- "examples/joint-bilateral.md"

## Complexity

--8<-- "filters/joint-bilateral-complexity.md"

## Artifacts and limitations

--8<-- "filters/joint-bilateral-limits.md"

## Tests

The reference computes the guide weights with NumPy. Before it is used, the script checks it against `cv2.ximgproc.jointBilateralFilter` on gray images, and checks that guiding by the image itself gives the bilateral filter. The test covers both guide modes with a separate guide and one case without a guide, for all five border modes. Engine tests check that a guide gives the same pixels in strips, in regions and in workers as in a whole-image run.

--8<-- "filters/joint-bilateral-tests.md"

## References

--8<-- "filters/joint-bilateral-references.md"
