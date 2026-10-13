# Marr-Hildreth

--8<-- "filters/marr-hildreth-facts.md"

## Overview

The Marr-Hildreth detector finds edges as the zero crossings of the Laplacian of Gaussian. The Gaussian sets the scale and removes noise, and the Laplacian crosses zero where the brightness changes fastest. The result is a mask of thin, closed edge lines.

<figure markdown="span">
  ![Three panels: bright disks on a dark background, the Marr-Hildreth edges with threshold 0, which include loops from faint shading, and with threshold 2, which keep only the disk outlines.](../../assets/figures/marr-hildreth-light.svg#only-light){ width="480" }
  ![Three panels: bright disks on a dark background, the Marr-Hildreth edges with threshold 0, which include loops from faint shading, and with threshold 2, which keep only the disk outlines.](../../assets/figures/marr-hildreth-dark.svg#only-dark){ width="480" }
  <figcaption>With threshold 0 even faint shading makes edge loops. A small threshold keeps the real outlines.</figcaption>
</figure>

## How it works

1. Apply the Laplacian of Gaussian with the chosen sigma.
2. Find negative pixels with a positive neighbor.
3. Mark them when the jump is above the threshold.

## Mathematical foundation

--8<-- "filters/marr-hildreth-formula.md"

Marr and Hildreth argued that edges should be found at several scales, each with a Gaussian of a different size, and that the zero crossings of the Laplacian mark them. The Laplacian is rotation invariant, so edges in all directions are treated the same. Zero crossings form closed curves, which is both a strength and a weakness: gentle shading also produces closed loops, so a threshold on the jump is needed.

## Kernel or operator

There is no single kernel. The Inspector shows the two steps. The LoG kernel is on the Laplacian of Gaussian page.

## Algorithm

--8<-- "filters/marr-hildreth-steps.md"

## Parameters

--8<-- "filters/marr-hildreth-params.md"

## Implementation

`marrHildrethFilter` in `web/src/core/filters/edges/zero-crossing.ts` extends the plane once by the LoG support plus one pixel with the border mode, runs the LoG filter and the zero-crossing rule, and cuts the extension off. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope, alpha and the output mapping. By default it works on luma and gives a gray mask.

## Worked example

--8<-- "examples/marr-hildreth.md"

## Complexity

--8<-- "filters/marr-hildreth-complexity.md"

## Artifacts and limitations

--8<-- "filters/marr-hildreth-limits.md"

## Tests

The reference runs `scipy.ndimage.gaussian_laplace` on the extended plane and applies the same rule. Before it is used, the script checks that a step edge is marked on its bright side, the negative side of the LoG, and nowhere else. The test covers two sigma and threshold settings for all five border modes.

--8<-- "filters/marr-hildreth-tests.md"

## References

--8<-- "filters/marr-hildreth-references.md"
