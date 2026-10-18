# Rotate and flip

--8<-- "filters/rotate-flip-facts.md"

## Overview

Rotate and flip turns the image by 90 or 180 degrees, or mirrors it. Open it from **Image > Rotate and flip**, or use the five commands of the Image menu directly. Whole pixels move to new places, so no value changes and nothing is lost. Four quarter turns give the image back exactly. The selection moves with the image.

## How it works

1. Find the new place of each pixel.
2. Copy the pixel there, as it is.

## Mathematical foundation

--8<-- "filters/rotate-flip-formula.md"

The quarter turns and the mirrors are permutations of the pixel grid. With the half turn and the two diagonal mirrors, which are a quarter turn followed by a flip, they form the eight symmetries of a square. Any angle that is not a multiple of 90 degrees moves pixels between grid points, so it needs resampling. That is [Rotate by angle](rotate-free.md).

## Kernel or operator

There is no kernel. Each output pixel is one input pixel.

## Algorithm

--8<-- "filters/rotate-flip-steps.md"

## Parameters

--8<-- "filters/rotate-flip-params.md"

## Implementation

`rotate` and `flip` in `web/src/core/image/transform.ts` copy each pixel as one 32-bit word. The dialog runs the matching command of the Image menu, which also moves the selection and records the step in the history.

## Worked example

An image of 3 x 2 pixels whose red values number the pixels:

\[
\begin{pmatrix} 0 & 1 & 2 \\ 3 & 4 & 5 \end{pmatrix}
\xrightarrow{\text{cw}}
\begin{pmatrix} 3 & 0 \\ 4 & 1 \\ 5 & 2 \end{pmatrix},
\qquad
\begin{pmatrix} 0 & 1 & 2 \\ 3 & 4 & 5 \end{pmatrix}
\xrightarrow{\text{horizontal}}
\begin{pmatrix} 2 & 1 & 0 \\ 5 & 4 & 3 \end{pmatrix}
\]

The clockwise turn makes the image 2 pixels wide and 3 high. Its first row is the first column of the input, read from the bottom up.

## Complexity

--8<-- "filters/rotate-flip-complexity.md"

## Artifacts and limitations

--8<-- "filters/rotate-flip-limits.md"

## Tests

The unit tests check every turn and both mirrors on the example above, with hand-computed results.

--8<-- "filters/rotate-flip-tests.md"

## References

--8<-- "filters/rotate-flip-references.md"
