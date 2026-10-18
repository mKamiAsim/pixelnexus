# Determinant of Hessian

--8<-- "filters/blob-doh-facts.md"

## Overview

Determinant of Hessian blob detection finds spots where the brightness curves the same way in every direction. It uses box filters on the integral image, as the Fast-Hessian detector of SURF does, so each scale costs the same, whatever its size. It finds bright and dark blobs in one run. The image does not change. The blobs go to the Features panel and are drawn on the canvas. The filter runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels of the Disks test image. With the defaults, rings mark the smaller disks and the single bright pixels, and the large disks get rings of the largest radius, off their centers. A false ring sits in the top left corner. With the smallest sigma at 3, the single pixels lose their rings. On a noisy copy, the rings are much the same.](../../assets/figures/blob-doh-light.svg#only-light){ width="480" }
  ![Four panels of the Disks test image. With the defaults, rings mark the smaller disks and the single bright pixels, and the large disks get rings of the largest radius, off their centers. A false ring sits in the top left corner. With the smallest sigma at 3, the single pixels lose their rings. On a noisy copy, the rings are much the same.](../../assets/figures/blob-doh-dark.svg#only-dark){ width="480" }
  <figcaption>The Disks test image, and the blobs found with the defaults, with the smallest sigma at 3, and on a noisy copy. Each blob is drawn as a ring of its radius.</figcaption>
</figure>

## How it works

--8<-- "filters/blob-doh-steps.md"

## Mathematical foundation

--8<-- "filters/blob-doh-formula.md"

The Hessian is the matrix of second derivatives. In the middle of a blob, the brightness curves the same way in all directions, so both eigenvalues have the same sign and the determinant is large and positive. At an edge, one curvature is small, so the determinant is small.

Bay and coworkers replaced the Gaussian second derivatives by box filters. With the integral image, any box sum takes four lookups, so the cost does not depend on the scale. Here scikit-image uses boxes that span floor(3 sigma) pixels and divides each sum by the square of that size. It weights the mixed term by 0.81 = 0.9^2, as SURF does. For true second derivatives, a negated image has the same determinant, so bright and dark blobs are both found. The boxes of scikit-image only sum to zero when floor(3 sigma) is a multiple of 3, though. So the brightness level itself adds a little to the response, and even a flat gray image can give a false blob.

Peaks over position and scale above the threshold are blobs, and overlapping blobs are pruned. The radius is about sigma. A disk larger than the largest sigma has no matching scale, so it is found in the wrong place.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the input luma, the response with the list of scales, the peak rule with the threshold, and the pruning rule with the overlap.

## Parameters

--8<-- "filters/blob-doh-params.md"

## Implementation

`blob_doh_filter` in `engine/src/pixelnexus_engine/filters/blobs.py` takes the luma from 0 to 1 and calls `skimage.feature.blob_doh`. The score is the box-filter determinant at the peak, from the same scikit-image function that `blob_doh` uses. There is no setting for bright or dark blobs, since it finds both.

The result is a table, not an image. It has one row per blob, with x and y, the radius, sigma and the score. The x and y columns give the column and row of the center pixel, counted from 0 at the top left. The Features panel shows the table, exports it as CSV, and switches the drawing on the canvas. With a selection, the detector still looks at the whole image, and only the blobs whose center lies in the selection are kept. The Feature viewer in the Learn panel runs the detector on the patch around the probe.

## Worked example

--8<-- "examples/blob-doh.md"

## Complexity

--8<-- "filters/blob-doh-complexity.md"

## Artifacts and limitations

--8<-- "filters/blob-doh-limits.md"

## Tests

The detector must return what `skimage.feature.blob_doh` returns. On the Disks image and on its negative, it must find the three middle-sized disks within 3 pixels. On a flat gray image it must find the one false blob that the limits name. The engine API tests check that the table arrives as JSON, and the stages of the representation.

--8<-- "filters/blob-doh-tests.md"

## References

--8<-- "filters/blob-doh-references.md"
