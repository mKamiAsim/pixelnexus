# Multi-level Otsu

--8<-- "filters/multi-otsu-facts.md"

## Overview

Multi-level Otsu splits the gray levels of the image into several classes, such as dark, middle and bright. It picks the thresholds that make the classes as different as possible, the same rule Otsu's method uses for two classes. Liao, Chen and Chung showed how to find them quickly. The classes go to the Features panel with their area, centroid and mean brightness, and are drawn over the image in their label colors. Click a row number to make a class the selection. The filter can also show the classes as gray levels. It runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![The input has a dark ground that brightens to the right, gray squares and bright disks, with noise. The 3 classes in their label colors separate the ground, the squares and the disks, with a thin rim of square color around the disks where the blur mixes levels. The gray levels panel shows the classes as black, gray and white. The boundaries panel draws yellow lines around the squares and the disks.](../../assets/figures/multi-otsu-light.svg#only-light){ width="480" }
  ![The input has a dark ground that brightens to the right, gray squares and bright disks, with noise. The 3 classes in their label colors separate the ground, the squares and the disks, with a thin rim of square color around the disks where the blur mixes levels. The gray levels panel shows the classes as black, gray and white. The boundaries panel draws yellow lines around the squares and the disks.](../../assets/figures/multi-otsu-dark.svg#only-dark){ width="480" }
  <figcaption>A test image with a dark ground that brightens to the right, gray squares and bright disks, with noise of sigma 8. Then the 3 classes in their label colors, as gray levels, and as boundaries in yellow over the image.</figcaption>
</figure>

## How it works

--8<-- "filters/multi-otsu-steps.md"

## Mathematical foundation

--8<-- "filters/multi-otsu-formula.md"

Otsu's criterion looks only at the histogram. A split is good when the classes have means far from the mean of the whole image, weighted by their size. For M classes the variance between classes sums over all of them, and the best thresholds make it largest.

Maximizing the variance between classes is the same as minimizing the variance within them, since the two add up to the fixed total variance. So the classes are as tight as possible around their means.

The search tries every set of thresholds. Liao and coworkers made each try cheap with lookup tables of the shares and means of every range of gray levels. But the number of sets grows like L to the power M - 1, so more than 4 or 5 classes become slow.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/multi-otsu-params.md"

## Implementation

`multi_otsu` in `engine/src/pixelnexus_engine/filters/segmentation.py` calls `skimage.filters.threshold_multiotsu` on the 8-bit luma with 256 bins. Each threshold is a gray level that belongs to the class below it, as in Otsu's method, where only pixels above the threshold are foreground. So a pixel's class is the number of thresholds strictly below its gray level, `numpy.digitize` with `right=True`, plus 1. The example in scikit-image's documentation uses `numpy.digitize` without `right=True`, which puts a pixel equal to a threshold in the class above. On an image of three flat levels, its thresholds are the two lower levels themselves. That version would move both lower levels up one class, so the middle level would join the top one. The gray levels output spreads the classes evenly from black to white.

The regions output is a label map. The engine sends it with a table of the regions, and the studio draws it over the image. See [the science engine](../../architecture/science-engine.md) for how label maps travel.

## Worked example

--8<-- "examples/multi-otsu.md"

With 3 classes, the thresholds 85 and 162 split the ground, the squares and the disks. With 2 classes, the squares and disks share a class. With 4 classes, the extra threshold cuts the ground in two along its brightness ramp, since the ground is the largest and widest group of levels. With 5 classes, one more threshold falls at 119, right inside the squares, and splits them by their noise. More classes do not find more objects, they split what is wide in the histogram.

## Complexity

--8<-- "filters/multi-otsu-complexity.md"

## Artifacts and limitations

--8<-- "filters/multi-otsu-limits.md"

## Tests

The classes must follow scikit-image's thresholds with a level equal to a threshold in the class below, for 2, 3 and 4 classes. On three flat levels of 20, 120 and 230, where scikit-image's thresholds are 20 and 120, each level must get its own class. The gray levels output must use 0, 128 and 255. The boundaries and mean colors outputs must match mark_boundaries and the rounded means.

--8<-- "filters/multi-otsu-tests.md"

## References

--8<-- "filters/multi-otsu-references.md"
