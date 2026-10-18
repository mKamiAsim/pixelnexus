# Kuwahara filter

--8<-- "filters/kuwahara-facts.md"

## Overview

The Kuwahara filter splits the window around each pixel into four overlapping quadrants and writes the mean of the quadrant whose values vary the least. Near an edge, the quadrants that cross the edge vary a lot, so a quadrant on one side wins, and the edge stays sharp. Flat areas are averaged. Large windows give a painted look.

<figure markdown="span">
  ![Four panels in two rows: disks with Gaussian noise, a 5x5 box filter that blurs the disks, a Kuwahara filter of size 5 with flat disks and sharp edges, and a Kuwahara filter of size 9 with a stronger painted look.](../../assets/figures/kuwahara-light.svg#only-light){ width="480" }
  ![Four panels in two rows: disks with Gaussian noise, a 5x5 box filter that blurs the disks, a Kuwahara filter of size 5 with flat disks and sharp edges, and a Kuwahara filter of size 9 with a stronger painted look.](../../assets/figures/kuwahara-dark.svg#only-dark){ width="480" }
  <figcaption>The Kuwahara filter flattens the noise and keeps the disk edges. Larger windows look more painted.</figcaption>
</figure>

## How it works

1. Split the window into four squares, the top-left, top-right, bottom-left and bottom-right quadrants. Each one holds the center pixel.
2. Measure the mean and the variance of each quadrant.
3. Write the mean of the quadrant with the smallest variance.

## Mathematical foundation

--8<-- "filters/kuwahara-formula.md"

The filter is an adaptive mean. Its averaging region is chosen per pixel by the smallest variance. For a window of side 2a + 1, each quadrant is a square of side a + 1. Neighboring pixels can choose different quadrants, which makes the typical blocky, brush-like texture. The variance is measured on luma, so a color image uses one quadrant for all channels.

## Kernel or operator

There is no kernel. The Inspector shows the window and the rule. The Learn panel shows a line profile, and the worked example below compares the four quadrants for one pixel.

## Algorithm

--8<-- "filters/kuwahara-steps.md"

## Parameters

--8<-- "filters/kuwahara-params.md"

## Implementation

`kuwaharaFilter` in `web/src/core/filters/nonlinear/subregions.ts` lists the quadrants as offsets with `kuwaharaRegions`. For each pixel, it measures the luma variance of each quadrant and averages each channel over the winner. The Nagao-Matsuyama filter uses the same code with other regions. It is a color filter: the framework in `web/src/core/filters/run.ts` hands it the red, green and blue planes together, with the border mode, and keeps alpha. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/kuwahara.md"

## Complexity

--8<-- "filters/kuwahara-complexity.md"

## Artifacts and limitations

--8<-- "filters/kuwahara-limits.md"

## Tests

The reference measures every quadrant of each NumPy window. Before it is used, the script checks it against a second computation with shifted box means of the luma from `scipy.ndimage.uniform_filter`. The test covers sizes 3, 5 and 7 on a color input, for all five border modes.

--8<-- "filters/kuwahara-tests.md"

## References

--8<-- "filters/kuwahara-references.md"
