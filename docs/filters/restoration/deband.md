# Debanding

--8<-- "filters/deband-facts.md"

## Overview

Debanding smooths the steps that show up in gentle gradients, such as skies, when an image has too few levels or was compressed hard. For each pixel, the filter looks at four pixels at a random distance and angle. If all four are close to it, the pixel lies in a smooth area, and it takes their mean, a value between the steps. Real edges differ by more than the threshold and stay. It runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Four panels: a gray ramp with faint curved bands; the debanded ramp; the banded ramp with its contrast stretched, showing six clear bands; and the debanded ramp stretched the same way, now a smooth gradient with fine grain.](../../assets/figures/deband-light.svg#only-light){ width="480" }
  ![Four panels: a gray ramp with faint curved bands; the debanded ramp; the banded ramp with its contrast stretched, showing six clear bands; and the debanded ramp stretched the same way, now a smooth gradient with fine grain.](../../assets/figures/deband-dark.svg#only-dark){ width="480" }
  <figcaption>A gentle ramp in steps of 4 levels and the result with a threshold of 5. The lower panels stretch the range 95 to 130 to the full gray scale, so the bands show clearly.</figcaption>
</figure>

## How it works

1. Draw a random distance, up to the range, and a random angle for every pixel. The seed fixes them.
2. Read four references: two along the angle and two at right angles, on both sides of the pixel.
3. If all four are within the threshold of the pixel, write their mean.
4. Otherwise keep the pixel.

## Mathematical foundation

--8<-- "filters/deband-formula.md"

A band is a flat step where the true image rises slowly. Averaging over an area wider than the band brings back the levels in between. A plain blur would also soften real edges, so the filter only averages where all four references agree with the pixel to within the threshold. The references sit in mirrored pairs, so their mean does not shift the gradient. Random positions mean that neighbors average different areas, which turns the step into fine grain. The eye accepts grain far better than a sharp contour. The idea comes from the deband filters of flash3kyuu_deband and FFmpeg. The details here, such as four references and the all-close test, are PixelNexus's own.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings: the reference positions and the replacement rule.

## Algorithm

--8<-- "filters/deband-steps.md"

## Parameters

--8<-- "filters/deband-params.md"

## Implementation

`deband` in `engine/src/pixelnexus_engine/filters/artifacts.py` draws the offsets once with `deband_offsets`, so all channels use the same positions, then runs `deband_plane` on each channel the scope names. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/deband.md"

## Complexity

--8<-- "filters/deband-complexity.md"

## Artifacts and limitations

--8<-- "filters/deband-limits.md"

## Tests

On a ramp in steps of 4 levels, the local mean of the result must be at least 3 dB closer to the smooth ramp. A step higher than the threshold must stay exactly. The offsets must stay within the range and follow the seed. The engine API tests run jobs and check the stages of the representation.

--8<-- "filters/deband-tests.md"

## References

--8<-- "filters/deband-references.md"
