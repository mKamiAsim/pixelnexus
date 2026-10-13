# Phase-only filter

--8<-- "filters/phase-only-facts.md"

## Overview

The phase-only filter keeps the phase of every frequency and gives them all the same magnitude. What remains are the edges and lines of the image. It shows that the phase of a spectrum carries much of what makes an image recognizable, a classic result of Oppenheim and Lim.

<figure markdown="span">
  ![Four panels: disks, their phase-only result with bright outlines, a Siemens star, and its phase-only result with the spokes outlined.](../../assets/figures/phase-only-light.svg#only-light){ width="480" }
  ![Four panels: disks, their phase-only result with bright outlines, a Siemens star, and its phase-only result with the spokes outlined.](../../assets/figures/phase-only-dark.svg#only-dark){ width="480" }
  <figcaption>The phase-only filter keeps the edges of the disks and the spokes of the star.</figcaption>
</figure>

## How it works

1. Transform the image with the FFT.
2. Set the magnitude of every frequency to the mean magnitude, and keep its phase.
3. Transform back. Edges and lines remain.

## Mathematical foundation

--8<-- "filters/phase-only-formula.md"

Each frequency F(f) is a magnitude |F| and a phase. The magnitude says how strong a wave is, and the phase where it sits. Edges are places where many waves line up in phase. Natural images have much more magnitude at low frequencies. Setting every magnitude to the same value raises the high frequencies, so only the places where waves line up stand out. The filter uses the mean magnitude M, so the result keeps the scale of the image. Magnitudes below 1e-9 times the largest count as 0. A mirror extension makes some frequencies exactly 0, and scaling their rounding noise up would add false content.

## Kernel or operator

The gain depends on the image, so the Inspector lists the stages. The Frequency explorer shows the gain on the patch.

## Algorithm

--8<-- "filters/phase-only-steps.md"

## Parameters

--8<-- "filters/phase-only-params.md"

## Implementation

`phaseOnlyFilter` in `web/src/core/filters/frequency/shaping.ts` computes the gains with `phaseOnlyValues`. As for the other frequency filters, the image is extended with the border mode by half its size, at most 256 pixels, on each side. The filter needs the whole spectrum, so it always runs on the whole image, and a selection is cut out of the result.

## Worked example

--8<-- "examples/phase-only.md"

## Complexity

--8<-- "filters/phase-only-complexity.md"

## Artifacts and limitations

--8<-- "filters/phase-only-limits.md"

## Tests

The reference extends the plane with `numpy.pad`, filters it with `numpy.fft` and crops it. The same rule for magnitudes that count as 0 is used. Before the cases are written, the script checks that every frequency gets the mean magnitude.

--8<-- "filters/phase-only-tests.md"

## References

--8<-- "filters/phase-only-references.md"
