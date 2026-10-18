# Descreening

--8<-- "filters/descreen-facts.md"

## Overview

Descreening removes the regular dot pattern of printed halftones from scans of magazines, newspapers and printed photos. A regular pattern makes a few sharp, isolated peaks in the spectrum. The filter finds those peaks by itself, lowers them to the level of the spectrum around them, and turns the spectrum back into an image. The picture keeps its detail between the peaks. It runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Four panels: a scan of disks made of a fine dot grid; the descreened result, with the grid mostly gone and some fine grain left; the removed pattern, a regular dot grid on mid gray; and a Gaussian blur of the scan, smooth but softer.](../../assets/figures/descreen-light.svg#only-light){ width="480" }
  ![Four panels: a scan of disks made of a fine dot grid; the descreened result, with the grid mostly gone and some fine grain left; the removed pattern, a regular dot grid on mid gray; and a Gaussian blur of the scan, smooth but softer.](../../assets/figures/descreen-dark.svg#only-dark){ width="480" }
  <figcaption>A scanned halftone of disks, the result with the defaults, the pattern it removed, and a Gaussian blur of sigma 2 for comparison.</figcaption>
</figure>

## How it works

1. Extend the channel with the border mode and take its spectrum.
2. For each frequency, find the highest value of the log spectrum on a ring around it.
3. Mark the frequencies that stand above that ring by the threshold, far enough from the center, and widen them.
4. Lower the marked frequencies to the median of their ring, keeping the phase.
5. Turn the spectrum back into an image and crop it.

## Mathematical foundation

--8<-- "filters/descreen-formula.md"

A screen is periodic, so its spectrum is a lattice of isolated peaks: the screen frequency and its harmonics. The spectrum of the picture is not flat either. Edges make lines through the center and round shapes make rings. A simple rule, such as everything far above a median background, mistakes those lines and rings for a screen and damages the picture. The isolation test avoids that. A point on a line or a ring has neighbors on the surrounding ring that are as high as itself, while a screen peak stands above all of them. This is notch filtering, as in Gonzalez and Woods, with the notches placed automatically. The peak rule is PixelNexus's own. A binary screen also leaves broadband noise that no notch removes, so a scan stays a little grainy.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings: the log spectrum, the peak test with its ring, and the suppression.

## Algorithm

--8<-- "filters/descreen-steps.md"

## Parameters

--8<-- "filters/descreen-params.md"

## Implementation

`descreen` in `engine/src/pixelnexus_engine/filters/artifacts.py` runs `descreen_plane` on each channel the scope names. `peak_mask` builds the ring with `ring_footprint` and uses the maximum and median filters of `scipy.ndimage` with wrap-around, since the spectrum is periodic. All steps treat a frequency and its mirror alike, so the result is real. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/descreen.md"

## Complexity

--8<-- "filters/descreen-complexity.md"

## Artifacts and limitations

--8<-- "filters/descreen-limits.md"

## Tests

A disk with a two-way cosine screen must come back to within 30 dB, and the removed output must match the screen. Images without a screen, a soft disk, a Siemens star and a photo-like image, must change by less than half a level. The engine API tests run jobs and check the stages of the representation.

--8<-- "filters/descreen-tests.md"

## References

--8<-- "filters/descreen-references.md"
