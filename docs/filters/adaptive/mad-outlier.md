# Median absolute deviation thresholding

--8<-- "filters/mad-outlier-facts.md"

## Overview

MAD thresholding, also called the Hampel filter, finds values that lie much further from the local median than the local values usually do. The usual distance is the median absolute deviation, the MAD. Because the threshold follows the local spread, busy areas tolerate more variation than flat ones. The filter can repair the outliers with the median, or show where they are.

<figure markdown="span">
  ![Three panels: disks with Gaussian grain and black and white specks, the outlier view with white dots only at the specks, and the repaired image with the grain still there and the specks gone.](../../assets/figures/mad-outlier-light.svg#only-light){ width="480" }
  ![Three panels: disks with Gaussian grain and black and white specks, the outlier view with white dots only at the specks, and the repaired image with the grain still there and the specks gone.](../../assets/figures/mad-outlier-dark.svg#only-dark){ width="480" }
  <figcaption>With t = 3, the specks are outliers but the Gaussian grain is not, because the MAD measures it.</figcaption>
</figure>

## How it works

1. Find the median m of the window.
2. Find the median of the distances from m, the MAD, and scale it by 1.4826 to get S.
3. If the value is further than t times S from m, it is an outlier. Replace it by m, or mark it.

## Mathematical foundation

--8<-- "filters/mad-outlier-formula.md"

The three-sigma rule calls a value an outlier when it is more than three standard deviations from the mean. Outliers inflate both the mean and the standard deviation, so they can hide. Hampel replaced both with the median and the MAD, which ignore up to half of the samples. For Gaussian noise the MAD is about 0.6745 standard deviations, so the factor 1.4826 turns it into an estimate of the standard deviation. In a flat window the MAD is 0, and any value that differs from the median is an outlier.

## Kernel or operator

The Inspector shows the test with the current t. The Learn panel shows a line profile, and the worked example below runs the test for one window.

## Algorithm

--8<-- "filters/mad-outlier-steps.md"

## Parameters

--8<-- "filters/mad-outlier-params.md"

## Implementation

`madOutlierFilter` in `web/src/core/filters/adaptive/mad-outlier.ts` sorts each window to find m, then sorts the distances to find the MAD, in `medianAndScale`. Each channel is tested on its own. The mark view writes white where any channel is an outlier. It is a color filter: the framework in `web/src/core/filters/run.ts` hands it the red, green and blue planes together, with the border mode, and keeps alpha. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/mad-outlier.md"

## Complexity

--8<-- "filters/mad-outlier-complexity.md"

## Artifacts and limitations

--8<-- "filters/mad-outlier-limits.md"

## Tests

The reference computes the median and the scaled MAD of each NumPy window on a color input with impulses. Before it is used, the script checks the scaled MAD against `scipy.stats.median_abs_deviation` with the normal scale. The test covers both views, two window sizes and two thresholds for all five border modes.

--8<-- "filters/mad-outlier-tests.md"

## References

--8<-- "filters/mad-outlier-references.md"
