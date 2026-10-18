# Entropy filter

--8<-- "filters/local-entropy-facts.md"

## Overview

The entropy filter maps how many different values occur in the window around each pixel, and how evenly. A flat window has entropy 0. A window full of different values has a high entropy. Unlike the variance, the entropy ignores how far apart the values are, so a clean black and white pattern has a low entropy and noise has a high one.

<figure markdown="span">
  ![Four panels in two rows: a checkerboard and its entropy map, dark except along the square borders, then the Noise patches image and its entropy map, bright in the noisy quadrants.](../../assets/figures/local-entropy-light.svg#only-light){ width="480" }
  ![Four panels in two rows: a checkerboard and its entropy map, dark except along the square borders, then the Noise patches image and its entropy map, bright in the noisy quadrants.](../../assets/figures/local-entropy-dark.svg#only-dark){ width="480" }
  <figcaption>The checkerboard has a high variance but a low entropy, because it has only two values. Noise has a high entropy.</figcaption>
</figure>

## How it works

1. Count how often each value occurs in the window.
2. Divide the counts by the window size to get shares.
3. Add up minus each share times its base-2 logarithm.

## Mathematical foundation

--8<-- "filters/local-entropy-formula.md"

This is the Shannon entropy of the local histogram, in bits. A window of n values holds at most log2 n bits, when all n values differ. Values are rounded to whole numbers first, so it counts 256 possible values. The entropy is a first-order texture measure: it uses only how often values occur, not where they are in the window. The result is a new quantity, not an image, so it goes through the output mapping. With the brightness scope the map is gray.

## Kernel or operator

There is no kernel. The Inspector shows the window and the statistic. The Rank stepper in the Learn panel shows the window values at any pixel, sorted, next to the value the filter gives there.

## Algorithm

--8<-- "filters/local-entropy-steps.md"

## Parameters

--8<-- "filters/local-entropy-params.md"

## Implementation

`localEntropyFilter` in `web/src/core/filters/adaptive/local-stats.ts` reads the sliding 256-bin histogram of `histogramPlane`, the same one the median and mode filters use, and adds up the entropy terms in `histogramEntropy`. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the mapping to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/local-entropy.md"

## Complexity

--8<-- "filters/local-entropy-complexity.md"

## Artifacts and limitations

--8<-- "filters/local-entropy-limits.md"

## Tests

The reference counts the values of each NumPy window. Before it is used, it is checked against `skimage.filters.rank.entropy` away from the image edge, where both see the same pixels. The test covers window sizes 3 and 5 for all five border modes.

--8<-- "filters/local-entropy-tests.md"

## References

--8<-- "filters/local-entropy-references.md"
