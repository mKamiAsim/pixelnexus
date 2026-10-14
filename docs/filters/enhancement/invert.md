# Invert

--8<-- "filters/invert-facts.md"

## Overview

Invert turns the image into its negative. Black becomes white, white becomes black, and each color turns into its complement. Inverting twice gives the image back.

<figure markdown="span">
  ![Two panels: bright disks on a dark background, and the inverted image with dark disks on a bright background.](../../assets/figures/invert-light.svg#only-light){ width="480" }
  ![Two panels: bright disks on a dark background, and the inverted image with dark disks on a bright background.](../../assets/figures/invert-dark.svg#only-dark){ width="480" }
  <figcaption>Disks and their negative.</figcaption>
</figure>

## How it works

1. Subtract every value from 255.

## Mathematical foundation

--8<-- "filters/invert-formula.md"

Gonzalez and Woods call this the image negative, s = L - 1 - r. It is a straight line with slope -1, so it keeps all contrast and only reverses its sign.

## Kernel or operator

The Inspector draws the transfer curve for the current settings, with the input value on the horizontal axis and the output on the vertical axis. The Point-op curve in the Learn panel draws the same curve with the histograms of the open image before and after.

## Algorithm

--8<-- "filters/invert-steps.md"

## Parameters

--8<-- "filters/invert-params.md"

## Implementation

`invertFilter` in `web/src/core/filters/enhancement/point-ops.ts` uses `invertTransfer`. The filter is a point filter: the runner builds a table of 256 outputs once and looks up each pixel. Values between two levels, as luma often is, go through the curve directly.

## Worked example

--8<-- "examples/invert.md"

## Complexity

--8<-- "filters/invert-complexity.md"

## Artifacts and limitations

--8<-- "filters/invert-limits.md"

## Tests

The reference writes the same curve with NumPy and applies it to the random test plane. Before the cases are written, the curve is checked against Pillow's `ImageOps.invert` on all 256 levels.

--8<-- "filters/invert-tests.md"

## References

--8<-- "filters/invert-references.md"
