# Matched vessel filter

--8<-- "filters/matched-vessel-facts.md"

## Overview

The matched vessel filter finds thin lines whose brightness across them follows a Gaussian curve, such as blood vessels in retinal photos. It slides a small model of a straight vessel piece over the image in many directions and keeps the best match at each pixel. The result is a map of vessel strength, ready for a threshold, or the direction of the best match.

<figure markdown="span">
  ![Three panels: noisy dark lines on a gray background in the shape of a circle, a wave and a diagonal, the matched filter response with bright lines on a dark background, and the direction map, which is smooth along the lines and noisy elsewhere.](../../assets/figures/matched-vessel-light.svg#only-light){ width="480" }
  ![Three panels: noisy dark lines on a gray background in the shape of a circle, a wave and a diagonal, the matched filter response with bright lines on a dark background, and the direction map, which is smooth along the lines and noisy elsewhere.](../../assets/figures/matched-vessel-dark.svg#only-dark){ width="480" }
  <figcaption>Noisy dark lines with a Gaussian profile, the largest matched filter response with sigma 1.5 and length 9, and the direction of the best match.</figcaption>
</figure>

## How it works

1. Build a kernel that looks like a short dark line with a Gaussian profile, and subtract its mean.
2. Turn it to each direction and correlate the image with it.
3. Keep the largest response at each pixel, or the direction where it is reached.

## Mathematical foundation

--8<-- "filters/matched-vessel-formula.md"

A matched filter correlates the image with a model of the pattern it looks for. Chaudhuri and colleagues modeled the cross section of a retinal vessel as a Gaussian dip and noted that short pieces of a vessel are nearly straight. Their kernel follows the dip across the vessel and stays constant along it for a short length. Subtracting the mean makes each kernel add up to 0, so slow changes in background brightness give no response. Since a vessel can run in any direction, the kernel is turned to many directions, and the best match wins.

## Kernel or operator

The Inspector shows the kernel for a horizontal vessel with the current settings. The filter turns it to every direction in the same way.

## Algorithm

--8<-- "filters/matched-vessel-steps.md"

## Parameters

--8<-- "filters/matched-vessel-params.md"

## Implementation

`vesselKernel` in `web/src/core/filters/features/matched-vessel.ts` builds each kernel on the grid offsets whose distance across the vessel is at most 3 sigma and whose distance along it is at most half the length. This choice of offsets is this filter's own discrete rule. The filter correlates the image with every kernel and keeps the largest response. For the direction output, the first direction within 1e-9 times max(1, |R|) of the largest response wins, so ties do not depend on rounding. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope, alpha and the output mapping. By default it works on luma.

## Worked example

--8<-- "examples/matched-vessel.md"

## Complexity

--8<-- "filters/matched-vessel-complexity.md"

## Artifacts and limitations

--8<-- "filters/matched-vessel-limits.md"

## Tests

No common library has this filter, so the reference builds the same kernels in Python and runs `scipy.ndimage.correlate`. Before the cases are written, the script checks that every kernel adds up to 0. It also checks that a dark Gaussian line at 30 degrees gives its largest response on the line, with the direction 30 on the line. The cases cover both polarities, both outputs and two sizes for all five border modes.

--8<-- "filters/matched-vessel-tests.md"

## References

--8<-- "filters/matched-vessel-references.md"
