# Image inpainting

--8<-- "filters/inpaint-facts.md"

## Overview

Inpainting fills the selected area from the pixels around it. Use it to remove scratches, dust, spots, wires or small objects. Select the defect, a little larger than it is, and apply the filter. Pixels outside the selection never change. Three classic methods are offered. Telea's method and the Navier-Stokes method come from OpenCV, and biharmonic inpainting comes from scikit-image. The filter runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Six panels: a Siemens star with a white diagonal scratch and a white spot, the white hole on black, the star before the damage, and three filled versions. All three fill the spot cleanly. Where the scratch crossed the spokes, Telea and Navier-Stokes leave thin streaks along the scratch, and biharmonic leaves soft gray blends.](../../assets/figures/inpaint-light.svg#only-light){ width="480" }
  ![Six panels: a Siemens star with a white diagonal scratch and a white spot, the white hole on black, the star before the damage, and three filled versions. All three fill the spot cleanly. Where the scratch crossed the spokes, Telea and Navier-Stokes leave thin streaks along the scratch, and biharmonic leaves soft gray blends.](../../assets/figures/inpaint-dark.svg#only-dark){ width="480" }
  <figcaption>A Siemens star with a scratch and a spot, the hole, the star before the damage, and the three methods with the other defaults.</figcaption>
</figure>

## How it works

1. The studio sends the image and the selection to the engine.
2. Every pixel the selection touches is part of the hole.
3. The chosen method fills the hole from the known pixels around it.
4. Pixels outside the hole are kept exactly.
5. The studio blends the result in through the selection, so a soft edge fades.

## Mathematical foundation

--8<-- "filters/inpaint-formula.md"

Each method makes the fill meet the image smoothly at the edge of the hole, in its own way.

Telea's method is fast. It first finds the distance T of each hole pixel from the edge of the hole, with the fast marching method. Then it fills pixels in order of that distance, so the hole closes from its edge inward. A new pixel p is a weighted mean of the known pixels q within the radius. Each of them predicts I(p) from its value and its gradient, as I(q) + grad I(q) · (p - q). Pixels close to p, along the direction of grad T, and at the same distance from the edge count most.

The Navier-Stokes method of Bertalmio, Bertozzi and Sapiro treats brightness as the stream function of a 2D fluid. The smoothness Delta I then plays the part of the vorticity. In the steady state, it stays the same along the lines of equal brightness. So edges that meet the hole continue into it.

Biharmonic inpainting asks for the smoothest surface that meets the image at the edge of the hole, with its slope. It solves the biharmonic equation in the hole. A plane is its own biharmonic fill, so ramps are filled exactly.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the hole and the equations of the chosen method, with the radius for Telea and Navier-Stokes.

## Algorithm

--8<-- "filters/inpaint-steps.md"

## Parameters

--8<-- "filters/inpaint-params.md"

## Implementation

`inpaint` in `engine/src/pixelnexus_engine/filters/inpainting.py` takes the selection from the job. The `hole_of` function turns it into the hole, and `fill` calls `cv2.inpaint` with `INPAINT_TELEA` or `INPAINT_NS`, or `inpaint_biharmonic` of scikit-image. A selection that covers the whole image is refused, since nothing is left to fill from.

This filter reads the selection, so its catalog entry sets `needsSelection`. The studio then uploads the selection as a gray image, and the job names it as its mask. Without a selection, Apply asks you to make one. With the inverse scope, the hole is everything outside the selection. There is no live preview. The result arrives when you click Apply.

The Stage viewer in the Learn panel cannot use your selection, since it works on a small patch. It fills a disk of radius 8 pixels at the center of the patch instead.

## Worked example

--8<-- "examples/inpaint.md"

## Complexity

--8<-- "filters/inpaint-complexity.md"

## Artifacts and limitations

--8<-- "filters/inpaint-limits.md"

## Tests

Pixels outside the hole must never change. Telea and Navier-Stokes must equal `cv2.inpaint`, and biharmonic must equal `inpaint_biharmonic` rounded to 8 bits. Biharmonic must fill a linear ramp exactly. Navier-Stokes and biharmonic must keep a flat area flat. Telea's drift on a large flat hole must be the 5 levels the limits name. An empty hole must leave the image, and a hole over the whole image must be refused. The engine API tests send the selection as a mask. They also check that the engine refuses a job without its mask, a mask of another size, and a mask for a filter that does not read one.

--8<-- "filters/inpaint-tests.md"

## References

--8<-- "filters/inpaint-references.md"
