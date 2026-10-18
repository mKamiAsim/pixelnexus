# Super-resolution reconstruction

--8<-- "filters/sr-classical-facts.md"

## Overview

Super-resolution reconstruction enlarges the image 2, 3 or 4 times. It starts from a bicubic enlargement, the same as Resize. Then it corrects the large image until shrinking it again gives back the original. This is iterative back-projection, after Irani and Peleg. Edges come out sharper than with bicubic, and every original pixel stays the mean of the pixels that replace it. It cannot invent detail that the image never held. The filter runs in the PixelNexus engine on your computer, and the result replaces the image.

<figure markdown="span">
  ![Four panels: a Siemens star with 12 spokes, the same star shrunk to half and shown with large square pixels, a bicubic enlargement with soft spokes, and the back-projection result with slightly crisper spoke edges.](../../assets/figures/sr-classical-light.svg#only-light){ width="480" }
  ![Four panels: a Siemens star with 12 spokes, the same star shrunk to half and shown with large square pixels, a bicubic enlargement with soft spokes, and the back-projection result with slightly crisper spoke edges.](../../assets/figures/sr-classical-dark.svg#only-dark){ width="480" }
  <figcaption>A Siemens star shrunk to half by block means, then enlarged again with bicubic and with 10 iterations of back-projection.</figcaption>
</figure>

## How it works

1. Premultiply the colors by alpha, as Resize does.
2. Enlarge the image with bicubic. This is the start.
3. Shrink the estimate with the camera model, and take the difference from the image.
4. Enlarge the difference with bicubic and add it to the estimate.
5. Repeat steps 3 and 4 for the chosen number of iterations.
6. Divide the colors by the enlarged alpha again.

## Mathematical foundation

--8<-- "filters/sr-classical-formula.md"

The geometry follows Resize. Pixel i covers the interval from i to i + 1, so its center is at i + 1/2. The center of output pixel x then sits at u = (x + 1/2) / s - 1/2 in input pixels. With this rule the picture does not shift, whatever the scale.

The filter needs a model of how the small image came about. Here each input pixel is the mean of the s x s output pixels it covers, as if a camera with bigger pixels had taken the picture. Call this shrinking D, and the bicubic enlargement U. The start x_0 = U g looks right, but D x_0 is not quite g, since bicubic is not the inverse of the block mean. Back-projection adds the enlarged difference, U (g - D x_k), in every step. For one image and no motion, this is the update of Irani and Peleg with the bicubic kernel as the back-projection kernel.

The difference g - D x_k is multiplied by the matrix I - D U in every step. The eigenvalues of D U lie between 0 and 1, so the difference shrinks every time, and in the end D x = g. The worked example shows how fast. Most of the gain comes in the first 3 steps.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the grid rule, the bicubic start with Keys' kernel, the camera model with its weight 1 / s^2, and the back-projection step with the number of iterations.

## Algorithm

--8<-- "filters/sr-classical-steps.md"

## Parameters

--8<-- "filters/sr-classical-params.md"

## Implementation

`sr_classical` in `engine/src/pixelnexus_engine/filters/superresolution.py` builds the enlargement and the camera model as sparse matrices, one for the rows and one for the columns. The `bicubic_matrix` function gives the same weights as Resize, renormalized near the edge. The `back_project` function holds the iteration. By default only the brightness Y is back-projected, and the colors are enlarged with bicubic.

This filter changes the image size, so its catalog entry sets `changesSize`. The engine returns the larger result with its size. Before the job starts, the studio checks the new size against the image limits in Preferences. The filter runs on the whole image, and the selection is enlarged with the image. Undo brings back the image at its old size. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/sr-classical.md"

## Complexity

--8<-- "filters/sr-classical-complexity.md"

## Artifacts and limitations

--8<-- "filters/sr-classical-limits.md"

## Tests

The enlargement matrices must equal the weights of the NumPy reference for Resize to 1e-14, for several sizes and scales. With 0 iterations the whole filter must give Resize with the bicubic method, alpha included, to within one level where a value lands on a half. The camera model must be the mean of each block. A constant image must stay constant. The difference between the image and the camera model of the estimate must shrink in every step, and fall below 1e-6 after 30 steps. On a shrunk image, 10 iterations must beat bicubic by more than 1.4 dB. With the brightness scope, red, green and blue must change by the same amount. The engine API test checks the size of the result.

--8<-- "filters/sr-classical-tests.md"

## References

--8<-- "filters/sr-classical-references.md"
