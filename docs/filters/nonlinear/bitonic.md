# Bitonic filter

--8<-- "filters/bitonic-facts.md"

## Overview

The bitonic filter, by Treece, smooths like a Gaussian but keeps edges. It rests on a simple idea of what signal is. A signal is bitonic within the filter's reach: it rises to at most one peak, or falls to at most one dip, and anything else is noise. This depends only on the order of the values, not on their size. So the filter keeps edges of any height and needs no setting for the noise level. It combines rank filters with a Gaussian. The filter runs in the PixelNexus engine, in PixelNexus's own code.

<figure markdown="span">
  ![Four panels. The noisy input shows a dark area and a light area split by a diagonal edge, crossed by three thin bright lines, under heavy grain. The Gaussian removes the grain but blurs the edge and turns the lines into faint wide bands. The median keeps the edge sharp but removes the lines almost completely. The bitonic filter keeps the edge sharp and the lines thin and visible, with smooth flat areas.](../../assets/figures/bitonic-light.svg#only-light){ width="480" }
  ![Four panels. The noisy input shows a dark area and a light area split by a diagonal edge, crossed by three thin bright lines, under heavy grain. The Gaussian removes the grain but blurs the edge and turns the lines into faint wide bands. The median keeps the edge sharp but removes the lines almost completely. The bitonic filter keeps the edge sharp and the lines thin and visible, with smooth flat areas.](../../assets/figures/bitonic-dark.svg#only-dark){ width="480" }
  <figcaption>A step and three thin lines with noise of sigma 20. Then a Gaussian of sigma 0.33 l, a median over a disk of diameter l, and the bitonic filter, all with l = 9.</figcaption>
</figure>

## How it works

--8<-- "filters/bitonic-steps.md"

## Mathematical foundation

--8<-- "filters/bitonic-formula.md"

A morphological opening keeps dips and removes peaks narrower than its disk. A closing does the reverse. Treece uses centile versions, with a low centile c in place of the minimum and 100 - c in place of the maximum, so that small impulses are rejected too. A bitonic signal survives one of the two unchanged. To choose between them, the filter compares each with the input. A point by point comparison would only give back the input, so the differences are smoothed with a Gaussian first. Where the opening fits worse, the closing gets more weight, and the other way round.

In heavy noise, the opening and closing become nearly flat, one below the mean and one above. The weighted mix then reduces to the Gaussian of the input. So the filter never does worse than its Gaussian part by much, and it adds no new kind of artifact.

## Kernel or operator

There is no single kernel. The rank filters use a disk of diameter l, and the Gaussian has sigma 0.33 l and reaches 2 sigma. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/bitonic-params.md"

## Implementation

`bitonic` in `engine/src/pixelnexus_engine/filters/bitonic.py` follows the equations of Treece's technical report. The rank filters are `scipy.ndimage.percentile_filter` over a disk with dx^2 + dy^2 <= (l / 2)^2. The Gaussian is `scipy.ndimage.gaussian_filter` with sigma 0.33 l, cut at 2 sigma, as in the report's tests. The image is extended symmetrically at its edges, as the report does. Where both smoothed errors are 0, both weights are set to 0.5, as in the report's note on that case. The default length of 9 is our choice.

## Worked example

--8<-- "examples/bitonic.md"

On the disk and the square, the bitonic filter beats both the median and the Gaussian at every noise level, by 1.1 to 2.0 dB over the median. On the step with thin lines, every filter loses most of the line contrast, so the scores are close. The figure still shows the difference: only the bitonic filter keeps the lines. At sigma 5, a length of 9 smooths more than the noise needs, and all three filters score below the noisy input. A smaller length suits weak noise.

## Complexity

--8<-- "filters/bitonic-complexity.md"

## Artifacts and limitations

--8<-- "filters/bitonic-limits.md"

## Tests

The disk of diameter 9 must hold 69 pixels. The opening, the closing and the smoothed errors must match direct calls of the SciPy filters, and the output must follow the weighting equation. Where both errors are 0, both weights must be 0.5. A straight step must pass unchanged, and so must the inside of a ramp. A single impulse must stay with c = 0 and go with c = 10. At sigma 5 and 20, the filter must beat the median, which must beat the Gaussian. On pure strong noise, the output must stay close to the Gaussian.

--8<-- "filters/bitonic-tests.md"

## References

--8<-- "filters/bitonic-references.md"
