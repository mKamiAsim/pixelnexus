# DoG blob detection

--8<-- "filters/blob-dog-facts.md"

## Overview

DoG blob detection finds round spots and their sizes with differences of Gaussians. Each blur is subtracted from the next wider one. This is close to the scale-normalized Laplacian of Gaussian, and cheaper, since each blur is used twice. SIFT finds its keypoints in the same scale space. The image does not change. The blobs go to the Features panel and are drawn on the canvas. The filter runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels of the Disks test image. With the defaults, a ring marks each of the six disks, some a little smaller than the disk, and the single bright pixels get none. With the smallest sigma at 3, some rings change size, since the scales start at another sigma. On a noisy copy, the six disks still get their rings.](../../assets/figures/blob-dog-light.svg#only-light){ width="480" }
  ![Four panels of the Disks test image. With the defaults, a ring marks each of the six disks, some a little smaller than the disk, and the single bright pixels get none. With the smallest sigma at 3, some rings change size, since the scales start at another sigma. On a noisy copy, the six disks still get their rings.](../../assets/figures/blob-dog-dark.svg#only-dark){ width="480" }
  <figcaption>The Disks test image, and the blobs found with the defaults, with the smallest sigma at 3, and on a noisy copy. Each blob is drawn as a ring of its radius.</figcaption>
</figure>

## How it works

--8<-- "filters/blob-dog-steps.md"

## Mathematical foundation

--8<-- "filters/blob-dog-formula.md"

A Gaussian blur obeys the heat equation: its change with sigma is sigma times its Laplacian. So the difference of two blurs whose sigmas differ by the ratio k is about (k - 1) sigma^2 times the Laplacian of the blur. Dividing by k - 1 gives a response close to the scale-normalized Laplacian of Gaussian, as Lowe used for SIFT.

The sigmas start at the smallest sigma and grow by the ratio k until they pass the largest. A point is a blob when it is the largest of its 26 neighbors in position and scale and reaches the threshold. Overlapping blobs are pruned as in LoG blob detection. The blob's sigma is the smaller of the two in its difference, and its radius is sqrt(2) sigma. Since the sigmas grow by a factor, the sizes come in coarse steps for large blobs.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the input luma, the response with the list of scales, the peak rule with the threshold, and the pruning rule with the overlap.

## Parameters

--8<-- "filters/blob-dog-params.md"

## Implementation

`blob_dog_filter` in `engine/src/pixelnexus_engine/filters/blobs.py` takes the luma from 0 to 1 and calls `skimage.feature.blob_dog`. For dark blobs it uses 1 minus the luma. The score is the difference of the two blurs of `skimage.filters.gaussian` at the peak, divided by k - 1, as scikit-image computes it. The default threshold is 0.2, not the 0.5 of scikit-image, which finds no blob on the Disks image.

The result is a table, not an image. It has one row per blob, with x and y, the radius, sigma and the score. The x and y columns give the column and row of the center pixel, counted from 0 at the top left. The Features panel shows the table, exports it as CSV, and switches the drawing on the canvas. With a selection, the detector still looks at the whole image, and only the blobs whose center lies in the selection are kept. The Feature viewer in the Learn panel runs the detector on the patch around the probe.

## Worked example

--8<-- "examples/blob-dog.md"

## Complexity

--8<-- "filters/blob-dog-complexity.md"

## Artifacts and limitations

--8<-- "filters/blob-dog-limits.md"

## Tests

The detector must return what `skimage.feature.blob_dog` returns. On the Disks image, it must find the six disks within 2 pixels. Dark blobs must be the bright blobs of the negated image. A flat image must have no blobs. The engine API tests check that the table arrives as JSON, and the stages of the representation.

--8<-- "filters/blob-dog-tests.md"

## References

--8<-- "filters/blob-dog-references.md"
