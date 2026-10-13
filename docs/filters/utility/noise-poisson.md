# Add Poisson noise

--8<-- "filters/noise-poisson-facts.md"

## Overview

Add Poisson noise simulates photon counting, the main noise of low-light photos. Each value becomes a random photon count with a mean proportional to the value, and the count is scaled back. Fewer photons at white mean a darker scene and more noise. The noise grows with the square root of the brightness.

<figure markdown="span">
  ![A plot of one row of the gray ramp, with Poisson noise for 20 and for 200 photons at white. Both are noisier on the bright side, and the 20-photon line is much noisier.](../../assets/figures/noise-poisson-light.svg#only-light){ width="480" }
  ![A plot of one row of the gray ramp, with Poisson noise for 20 and for 200 photons at white. Both are noisier on the bright side, and the 20-photon line is much noisier.](../../assets/figures/noise-poisson-dark.svg#only-dark){ width="480" }
  <figcaption>Fewer photons give more noise. The noise grows with the square root of the brightness.</figcaption>
</figure>

## How it works

1. Turn the value into a mean photon count.
2. Draw a random Poisson count with that mean.
3. Scale the count back to 0 to 255.

## Mathematical foundation

--8<-- "filters/noise-poisson-formula.md"

A Poisson count with mean lambda has variance lambda. So the noise standard deviation in levels is sqrt(lambda) times 255 / P, which grows with the square root of the value. The signal-to-noise ratio, mean over standard deviation, is sqrt(lambda): more photons give a cleaner image. Counts are whole numbers, so the noisy image has at most P + 1 distinct levels.

## Kernel or operator

There is no kernel. The Inspector describes the random process with the current photon count.

## Algorithm

--8<-- "filters/noise-poisson-steps.md"

## Parameters

--8<-- "filters/noise-poisson-params.md"

## Implementation

`poissonNoiseFilter` in `web/src/core/filters/utility/noise.ts` draws each count with `poissonSample` in `web/src/core/math/poisson.ts`, as NumPy's legacy generator does: the multiplication method of Knuth below a mean of 10, and the PTRS method of Hörmann above. The uniform numbers come from the position-based generator, so a strip gives the same noise as the whole image.

## Worked example

--8<-- "examples/noise-poisson.md"

## Complexity

--8<-- "filters/noise-poisson-complexity.md"

## Artifacts and limitations

--8<-- "filters/noise-poisson-limits.md"

## Tests

Unit tests draw 40000 counts for six means from 0.5 to 300 and check that the mean and the variance both match the mean. They also check the log-gamma function against exact values. A filter test adds Poisson noise to a flat gray image and checks the expected standard deviation in levels.

--8<-- "filters/noise-poisson-tests.md"

## References

--8<-- "filters/noise-poisson-references.md"
