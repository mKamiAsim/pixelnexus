# LoG blob detection

--8<-- "filters/blob-log-facts.md"

## Overview

LoG blob detection finds round spots and their sizes. It blurs the image with Gaussians of many sizes and takes the Laplacian of each blur, scaled so the sizes can be compared. A blob is a point where this response is larger than at all its neighbors, in place and in size. Each blob comes with its center, radius and score. The image does not change. The blobs go to the Features panel and are drawn on the canvas. The filter runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels of the Disks test image. With the defaults, a ring fits each of the six disks and a small ring marks each of the four single bright pixels. With the smallest sigma at 3, the small rings at the single pixels are gone. On a noisy copy, the disks and the single pixels still get their rings.](../../assets/figures/blob-log-light.svg#only-light){ width="480" }
  ![Four panels of the Disks test image. With the defaults, a ring fits each of the six disks and a small ring marks each of the four single bright pixels. With the smallest sigma at 3, the small rings at the single pixels are gone. On a noisy copy, the disks and the single pixels still get their rings.](../../assets/figures/blob-log-dark.svg#only-dark){ width="480" }
  <figcaption>The Disks test image, and the blobs found with the defaults, with the smallest sigma at 3, and on a noisy copy. Each blob is drawn as a ring of its radius.</figcaption>
</figure>

## How it works

--8<-- "filters/blob-log-steps.md"

## Mathematical foundation

--8<-- "filters/blob-log-formula.md"

The Laplacian of a Gaussian blur is strongly negative in the middle of a bright blob whose size matches the blur. As the blur grows, all second derivatives shrink, so a raw comparison over sizes would always favor small blurs. Lindeberg showed that multiplying by sigma^2 makes the sizes comparable. With this scale normalization, the response of a disk of radius r peaks at sigma = r / sqrt(2), so the radius of a blob is sqrt(2) sigma.

scikit-image builds the response at evenly spaced scales, or at scales evenly spaced in log sigma. A point is a blob when it is the largest of its 26 neighbors in the 3 x 3 x 3 block of position and scale, and reaches the threshold. Of two blobs whose areas overlap by more than the overlap limit, the smaller goes. The score in the table is the response at the peak.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the input luma, the response with the list of scales, the peak rule with the threshold, and the pruning rule with the overlap.

## Parameters

--8<-- "filters/blob-log-params.md"

## Implementation

`blob_log_filter` in `engine/src/pixelnexus_engine/filters/blobs.py` takes the luma from 0 to 1 and calls `skimage.feature.blob_log`. For dark blobs it uses 1 minus the luma. The score comes from `scipy.ndimage.gaussian_laplace` at the blob's scale, as scikit-image computes it.

The result is a table, not an image. It has one row per blob, with x and y, the radius, sigma and the score. The x and y columns give the column and row of the center pixel, counted from 0 at the top left. The Features panel shows the table, exports it as CSV, and switches the drawing on the canvas. With a selection, the detector still looks at the whole image, and only the blobs whose center lies in the selection are kept. The Feature viewer in the Learn panel runs the detector on the patch around the probe.

## Worked example

--8<-- "examples/blob-log.md"

## Complexity

--8<-- "filters/blob-log-complexity.md"

## Artifacts and limitations

--8<-- "filters/blob-log-limits.md"

## Tests

The detector must return what `skimage.feature.blob_log` returns, with the radius sqrt(2) sigma and the scores in falling order. On the Disks image, it must find each disk within 2 pixels, with a radius within half a scale step, and the four single bright pixels at sigma 1. With the smallest sigma at 3, only the six disks remain. Dark blobs must be the bright blobs of the negated image. The score must be minus sigma squared times the Gaussian Laplacian at the peak. A flat image must have no blobs. The engine API tests check that the table arrives as JSON, and the stages of the representation.

--8<-- "filters/blob-log-tests.md"

## References

--8<-- "filters/blob-log-references.md"
